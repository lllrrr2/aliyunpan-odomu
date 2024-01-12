import http, { Agent as HttpAgent } from 'http'
import https, { Agent as HttpsAgent } from 'https'
import crypto, { randomUUID } from 'crypto'
import path from 'path'
import { decodeName } from './utils'

// 默认maxFreeSockets=256
const httpsAgent = new HttpsAgent({ keepAlive: true })
const httpAgent = new HttpAgent({ keepAlive: true })

/**
 * 处理代理请求
 * @param request 请求对象
 * @param response 响应对象
 * @param encryptTransform 加密转换
 * @param decryptTransform 解密转换
 */
export async function httpProxy(request: any, response: any, encryptTransform: any, decryptTransform: any): Promise<void> {
  const { method, headers, urlAddr, passwdInfo, url, fileSize } = request
  const reqId = randomUUID()
  console.log('@@request_info: ', reqId, method, urlAddr, headers, !!encryptTransform, !!decryptTransform)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  return new Promise((resolve, reject) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp: http.IncomingMessage) => {
      console.log('@@statusCode', reqId, httpResp.statusCode, httpResp.headers)
      response.statusCode = httpResp.statusCode
      if (response.statusCode % 300 < 5) {
        // 可能出现304，redirectUrl = undefined
        const redirectUrl = httpResp.headers.location || '-'
        // 百度云盘不是https，坑爹，因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
        if (decryptTransform && passwdInfo.enable) {
          const key = crypto.randomUUID()
          // 、Referer
          httpResp.headers.location = `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(url)}`
        }
        console.log('302 redirectUrl:', redirectUrl)
      } else if (httpResp.headers['content-range'] && httpResp.statusCode === 200) {
        response.statusCode = 206
      }
      // 设置headers
      for (const key in httpResp.headers) {
        response.setHeader(key, httpResp.headers[key])
      }
      // 下载时解密文件名
      if (method === 'GET' && response.statusCode === 200
            && passwdInfo && passwdInfo.enable && passwdInfo.encName) {
        let fileName = decodeURIComponent(path.basename(url))
        let decFileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(path.extname(fileName), ''))
        if (decFileName) {
          let cd = response.getHeader('content-disposition')
          cd = cd ? cd.replace(/filename\*?=[^=;]*;?/g, '') : ''
          console.log('解密文件名...', reqId, fileName)
          response.setHeader('content-disposition', cd + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
        }
      }

      httpResp
        .on('end', () => {
          resolve()
        })
        .on('close', () => {
          console.log('响应关闭...', reqId, urlAddr)
          if (decryptTransform) decryptTransform.destroy()
        })
      // 是否需要解密
      decryptTransform ? httpResp.pipe(decryptTransform).pipe(response) : httpResp.pipe(response)
    })
    httpReq.on('error', (err) => {
      console.log('@@httpProxy request error ', reqId, err, urlAddr, headers)
    })
    // 是否需要加密
    encryptTransform ? request.pipe(encryptTransform).pipe(httpReq) : request.pipe(httpReq)
    // 重定向的请求 关闭时 关闭被重定向的请求
    response.on('close', () => {
      console.log('响应关闭...', reqId, url)
      httpReq.destroy()
    })
  })
}

/**
 * 发送http请求
 * @param request 请求对象
 * @param response 响应对象
 */
export async function httpClient(request: any, response: any): Promise<string> {
  const { method, headers, urlAddr, reqBody, url } = request
  console.log('@@request_client: ', method, urlAddr, headers)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  return new Promise((resolve, reject) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp) => {
      console.log('@@statusCode', httpResp.statusCode, httpResp.headers)
      if (response) {
        response.statusCode = httpResp.statusCode
        for (const key in httpResp.headers) {
          response.setHeader(key, httpResp.headers[key])
        }
      }
      let result = ''
      httpResp
        .on('data', (chunk) => {
          result += chunk
        })
        .on('end', () => {
          resolve(result)
          console.log('httpResp响应结束...', url)
        })
    })
    httpReq.on('error', (err) => {
      console.log('@@httpClient request error ', err)
    })
    // check request type
    if (!reqBody) {
      url ? request.pipe(httpReq) : httpReq.end()
      return
    }
    // 发送请求
    typeof reqBody === 'string' ? httpReq.write(reqBody) : httpReq.write(JSON.stringify(reqBody))
    httpReq.end()
  })
}