import {
  BasicPrivilege,
  HTTPRequestContext,
  IUser, Path,
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
import AliFile from '../../aliapi/file'
import { usePanTreeStore, useSettingStore } from '../../store'
import * as http from 'http'
import { promisify } from 'util'

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
      console.log('beforeRequest', ctx.request.method)
      const { headers, method } = ctx.request
      const { depth } = headers
      this.handleRequestPaths(ctx)
      await this.handleRequest(ctx)
      next()
    })
    server.afterRequest(async (ctx: HTTPRequestContext, next: () => void) => {
      console.info('afterRequest.path', ctx.requested.path)
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

  private async handleRequest(ctx: HTTPRequestContext) {
    if (ctx.request.method == 'GET' && useSettingStore().webDavStrategy === 'redirect') {
      const path = ctx.requested.path.paths.join('/')
      const user = ctx.user
      const { element, parentFolder } = Parser.parsePath('/' + path)
      const manageResource = this.rootFileSystem.manageResource
      const file = manageResource.findFile(manageResource.struct_cache.getStruct(parentFolder, user.uid), element)
      console.log('beforeRequest.file', file)
      if (file) {
        if (!this.fileInfo || this.fileInfo.file_id != file.file_id) {
          const data = await AliFile.ApiFileDownloadUrl(usePanTreeStore().user_id, file.drive_id, file.file_id, 14400)
          if (typeof data !== 'string' && data.url && data.url != '') {
            this.fileInfo = {
              url: data.url,
              name: file.name,
              file_id: file.file_id
            }
          }
        }
        // 302
        ctx.setCode(200)
        ctx.response.writeHead(302, { 'Location': this.fileInfo.url })
      }
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