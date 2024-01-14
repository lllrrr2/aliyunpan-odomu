import {
  BasicPrivilege,
  HTTPRequestContext,
  IUser,
  setDefaultServerOptions,
  SimplePathPrivilegeManager,
  WebDAVServer,
  WebDAVServerOptions
} from 'webdav-server/lib/index.v2'
import Parser from './helper/propertyParser'
import message from '../../utils/message'
import CustomRootFileSystem from './manager/AliFileSystem'
import UserManager from './user/UserManager'
import BasicAuthentication from './user/authentication/BasicAuthentication'
import { usePanTreeStore, useSettingStore } from '../../store'
import * as http from 'http'
import { promisify } from 'util'
import { getEncType, getRawUrl } from '../../utils/proxyhelper'

class WebDavServer {
  private options: WebDAVServerOptions
  private readonly userManager: UserManager
  private readonly rootFileSystem: CustomRootFileSystem
  private readonly httpAuthentication: BasicAuthentication
  private readonly privilegeManager: SimplePathPrivilegeManager
  private webDavExecute: any
  private webDavServer: any
  private fileInfo: any

  constructor(options?: WebDAVServerOptions) {
    this.userManager = new UserManager()
    this.httpAuthentication = new BasicAuthentication(this.userManager, 'Default realm')
    this.privilegeManager = new SimplePathPrivilegeManager()
    this.rootFileSystem = new CustomRootFileSystem('/')
    this.options = setDefaultServerOptions(Object.assign({
      httpAuthentication: this.httpAuthentication,
      privilegeManager: this.privilegeManager,
      rootFileSystem: this.rootFileSystem
    }, options))
    this.webDavExecute = this.execute()
  }

  private execute() {
    const server = new WebDAVServer(this.options)
    server.beforeRequest(async (ctx: HTTPRequestContext, next: () => void) => {
      // console.log('beforeRequest', ctx.request.method)
      const { headers, method } = ctx.request
      const { depth } = headers
      this.handleRequestPaths(ctx)
      // this.handleOptionsRequest(ctx, next)
      await this.handleGetRequest(ctx, next)
    })
    server.afterRequest(async (ctx: HTTPRequestContext, next: () => void) => {
      console.info('afterRequest.method', ctx.request.method)
      console.info('afterRequest.request', ctx.request)
      console.info('afterRequest.response', ctx.response)
      next()
    })
    return server.executeRequest
  }

  private handleRequestPaths(ctx: HTTPRequestContext) {
    let paths = ctx.requested.path.paths
    if (paths[0] !== 'webdav') {
      paths.unshift('webdav')
    }
    paths = Array.from(new Set(paths))
    const removePaths = ['.ini', '.inf', '127.0.0.1', 'http', 'SystemResources']
    paths = paths.filter(path => !removePaths.some(unwantedPath => path.includes(unwantedPath)))
    ctx.requested.uri = 'http://' + this.options.hostname + ':' + this.options.port + '/' + paths.join('/')
  }

  private async handleGetRequest(ctx: HTTPRequestContext, next: () => void) {
    if (ctx.request.method == 'GET') {
      const path = ctx.requested.path.paths.join('/')
      const user = ctx.user
      const { element, parentFolder } = Parser.parsePath('/' + path)
      const manageResource = this.rootFileSystem.manageResource
      const file = manageResource.findFile(manageResource.struct_cache.getStruct(parentFolder, user.uid), element)
      if (file) {
        if (useSettingStore().webDavStrategy === 'redirect') {
          console.log('beforeRequest.file', file)
          if (!this.fileInfo || this.fileInfo.file_id != file.file_id) {
            const data = await getRawUrl(usePanTreeStore().user_id, file.drive_id, file.file_id, getEncType({ description: file.description }))
            if (typeof data !== 'string' && data.url && data.url != '') {
              this.fileInfo = {
                url: data.url,
                name: file.name,
                file_id: file.file_id
              }
            }
          }
          // 302
          ctx.response.writeHead(302, {
            'Keep-Alive': 'true',
            'Location': this.fileInfo.url
          })
          ctx.setCode(200)
          ctx.exit()
        } else {
          if (file.mime_type?.includes('video')) {
            ctx.response.writeHead(200, {
              'Keep-Alive': 'true',
              'Accept-Ranges': 'bytes',
              'Content-Type': file.mime_type,
              'Content-Length': file.size
            })
          }
          next()
        }
      }
    } else {
      next()
    }
  }

  private handleOptionsRequest(ctx: HTTPRequestContext, next: () => void) {
    if (ctx.request.method === 'OPTIONS') {
      ctx.response.setHeader('DAV', '1,2')
      ctx.response.setHeader('Access-Control-Allow-Origin', '*')
      ctx.response.setHeader('Access-Control-Allow-Credentials', 'true')
      ctx.response.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Depth, Content-Type'
      )
      ctx.response.setHeader(
        'Access-Control-Allow-Methods',
        'PROPPATCH,PROPFIND,OPTIONS,DELETE,UNLOCK,COPY,LOCK,MOVE,HEAD,POST,PUT,GET'
      )
      ctx.response.setHeader(
        'Access-Control-Expose-Headers',
        'DAV, Content-Length, Allow'
      )
      ctx.response.setHeader('MS-Author-Via', 'DAV')
      ctx.setCode(200)
      ctx.exit()
    } else {
      next()
    }
  }

  config(options: WebDAVServerOptions) {
    this.options = Object.assign(this.options, options)
  }

  async start(): Promise<any> {
    const _this = this
    let iUsers = await this.getAllUser()
    if (iUsers.length > 0) {
      return new Promise((resolve, reject) => {
        _this.webDavServer = http.createServer(this.webDavExecute)
        _this.webDavServer.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            _this.webDavServer.close()
            reject(`端口${this.options.port}已被占用`)
          } else {
            reject(err)
          }
        })
        _this.webDavServer.listen(this.options.port, this.options.hostname, () => {
          resolve(true)
        })
      })
    } else {
      message.error('请先添加用户')
      return false
    }
  }

  async stop(): Promise<boolean> {
    const _this = this
    try {
      if (_this.webDavServer) {
        await promisify(_this.webDavServer.close).call(_this.webDavServer)
        _this.webDavServer.closeAllConnections()
        return true
      } else {
        return false
      }
    } catch (e) {
      return false
    }
  }

  setUser(username: string, password: string, path: string, rights: BasicPrivilege[] | string[], isModify: boolean, isAdmin?: boolean): Promise<Error | boolean> {
    return new Promise((resolve, reject) => {
      if (!username || !password) {
        message.error(isModify ? '添加用户失败' : '修改用户失败')
        reject(false)
      }
      this.userManager.getUserByName(username, async (error: Error, user?: IUser) => {
        if (!isModify && user) {
          message.error('重复添加用户')
          reject(false)
        }
        if (isModify && !user) {
          message.error('用户不存在')
          reject(false)
        }
        let rights1 = this.setRights(path, rights)
        await this.userManager.setUser(username, password, path, rights1, isAdmin)
        resolve(true)
      })
    })
  }

  setRights(path: string, rights: BasicPrivilege[] | string[]) {
    if (rights.indexOf('canRead') > 0) {
      rights.push('canReadLocks')
      rights.push('canReadContent')
      rights.push('canReadProperties')
      rights.push('canReadContentTranslated')
      rights.push('canReadContentSource')
    }
    if (rights.indexOf('canWrite') > 0) {
      rights.push('canWriteLocks')
      rights.push('canWriteContent')
      rights.push('canWriteProperties')
      rights.push('canWriteContentTranslated')
      rights.push('canWriteContentSource')
    }
    return [...rights]
  }

  getAllUser(): Promise<IUser[]> {
    return new Promise((resolve, reject) => {
      this.userManager.getUsers((error: Error, users: IUser[]) => {
        error ? resolve([]) : resolve(users)
      })
    })
  }

  getUser(username: string): Promise<IUser | undefined> {
    return new Promise((resolve, reject) => {
      this.userManager.getUserByName(username, (error: Error, user?: IUser) => {
        error ? resolve(undefined) : resolve(user)
      })
    })
  }

  delUser(username: string) {
    this.userManager.delUser(username)
  }
}

export default WebDavServer