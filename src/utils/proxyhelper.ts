import { useSettingStore } from '../store'
import FlowEnc from '../module/flow-enc'
import { IncomingMessage, Server, ServerResponse } from 'http'
import Db from './db'
import https, { Agent as HttpsAgent } from 'https'
import { GetExpiresTime } from './utils'
import { decodeName } from '../module/flow-enc/utils'
import { IAliFileItem, IAliGetFileModel } from '../aliapi/alimodels'
import { MainProxyPort } from '../layout/PageMain'
import AliFile from '../aliapi/file'


interface FileInfo {
  user_id: string
  drive_id?: string
  file_id?: string
  file_size?: number
  encType?: string

  [key: string]: string | number | undefined
}

export function getEncType(file: IAliGetFileModel | IAliFileItem | { description: string }): string {
  let description = file.description
  if (description) {
    if (description.includes('xbyEncrypt1')) {
      return 'xbyEncrypt1'
    } else if (description.includes('xbyEncrypt2')) {
      return 'xbyEncrypt2'
    }
  }
  return ''
}

export function getEncPassword(user_id: string, encType: string, inputpassword: string = ''): string {
  if (encType) {
    if (inputpassword) {
      return inputpassword
    }
    let settingStore = useSettingStore()
    let ecnPassword = decodeName(user_id, settingStore.securityEncType, settingStore.securityPassword) || ''
    return encType == 'xbyEncrypt1' ? ecnPassword : user_id
  }
  return ''
}

export function getFlowEnc(user_id: string, fileSize: number, encType: string, password: string = '') {
  if (!encType) return null
  let settingStore = useSettingStore()
  const securityPassword = getEncPassword(user_id, encType, password)
  const securityEncType = settingStore.securityEncType
  return new FlowEnc(securityPassword, securityEncType, fileSize)
}

export function getProxyUrl(info: FileInfo) {
  let proxyUrl = `http://127.0.0.1:${MainProxyPort}/proxy`
  let params = Object.keys(info).filter(v => info[v])
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(info[key]!!)}`)
  return `${proxyUrl}?${params.join('&')}`
}

export function getRedirectUrl(info: FileInfo) {
  let redirectUrl = `http://127.0.0.1:${MainProxyPort}/redirect`
  let params = Object.keys(info).filter(v => info[v])
    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(info[key]!!)}`)
  return `${redirectUrl}?${params.join('&')}`
}

export async function getRawUrl(user_id: string, drive_id: string, file_id: string, encType: string = '', password: string = '', weifa: boolean = false, preview: boolean = false) {
  let data: any = { url: '' }
  if (preview && useSettingStore().uiVideoMode == 'online') {
    data = await AliFile.ApiVideoPreviewUrl(user_id, drive_id, file_id)
  }
  if (!data.url && !weifa) {
    data = await AliFile.ApiFileDownloadUrl(user_id, drive_id, file_id, 14400)
  }
  // 代理播放
  if (encType) {
    data.url = getProxyUrl({
      user_id, drive_id, file_id, encType, password,
      file_size: data.size, lastUrl: data.url
    })
  }
  return data
}

export async function createProxyServer(port: number) {
  const http = require('http')
  const url = require('url')
  const proxyServer: Server = http.createServer(async (clientReq: IncomingMessage, clientRes: ServerResponse) => {
    const { pathname, query } = url.parse(clientReq.url, true)
    const { user_id, drive_id, file_id, file_size, encType, password, lastUrl } = query
    // console.log('proxy request: ', clientReq.url)
    console.info('proxy request query: ', query)
    if (pathname === '/proxy') {
      let decryptTransform: any = null
      // 需要解密
      // console.warn('proxy.range', clientReq.headers.range)
      if (encType) {
        // 要定位请求文件的位置 bytes=xxx-
        const range = clientReq.headers.range
        const start = range ? parseInt(range.replace('bytes=', '').split('-')[0]) : 0
        const flowEnc = getFlowEnc(user_id, file_size, encType, password)!!
        decryptTransform = flowEnc.decryptTransform()
        if (start) {
          await flowEnc.setPosition(start)
        }
      }
      let proxyInfo: any = await Db.getValueObject('ProxyInfo')
      // console.warn('proxyInfo', proxyInfo)
      let proxyUrl = (proxyInfo && proxyInfo.proxy_url || '') || lastUrl || ''
      if (!proxyUrl || proxyInfo && (file_id != proxyInfo.file_id || proxyInfo.expires_time <= Date.now())) {
        // 获取地址
        let data = await getRawUrl(user_id, drive_id, file_id)
        if (data && data.url) {
          let info: FileInfo = {
            user_id, drive_id, file_id, file_size, encType, password,
            expires_time: GetExpiresTime(data.url), proxy_url: data.url
          }
          await Db.saveValueObject('ProxyInfo', info)
          proxyUrl = data.url
        } else {
          clientRes.writeHead(500, { 'Content-Type': 'text/plain' })
          clientRes.end(JSON.stringify(data))
          await Db.deleteValueObject('ProxyInfo')
          decryptTransform && decryptTransform.destroy()
        }
      }
      if (proxyUrl) {
        console.warn('proxyUrl', proxyUrl)
        delete clientReq.headers.host
        delete clientReq.headers.referer
        delete clientReq.headers.authorization
        await new Promise((resolve, reject) => {
          // 处理请求，让下载的流量经过代理服务器
          const proxyServer = https.request(proxyUrl, {
            method: clientReq.method,
            headers: clientReq.headers,
            rejectUnauthorized: false,
            agent: new HttpsAgent({ keepAlive: true })
          }, (httpResp: any) => {
            // console.log('@@statusCode', httpResp.statusCode, httpResp.headers)
            clientRes.statusCode = httpResp.statusCode
            if (clientRes.statusCode % 300 < 5) {
              // 可能出现304，redirectUrl = undefined
              const redirectUrl = httpResp.headers.location || '-'
              if (decryptTransform) {
                // Referer
                httpResp.headers.location = getProxyUrl({
                  user_id, drive_id, file_id,
                  file_size, encType, proxy_url: proxyUrl
                })
              }
              console.log('302 redirectUrl:', redirectUrl)
            } else if (httpResp.headers['content-range'] && httpResp.statusCode === 200) {
              // 文件断点续传下载
              clientRes.statusCode = 206
            }
            clientRes.writeHead(httpResp.statusCode, httpResp.headers)
            httpResp.on('end', () => resolve(true))
            // 是否解密
            decryptTransform ? httpResp.pipe(decryptTransform).pipe(clientRes) : httpResp.pipe(clientRes)
          })
          clientReq.pipe(proxyServer)
          // 关闭解密流
          proxyServer.on('close', async () => {
            decryptTransform && decryptTransform.destroy()
          })
          // 重定向的请求 关闭时 关闭被重定向的请求
          clientRes.on('close', async () => {
            proxyServer.destroy()
          })
        })
        clientReq.on('error', (e: Error) => {
          console.log('client socket error: ' + e)
        })
      }
    }
  })
  proxyServer.listen(port)
  return proxyServer
}