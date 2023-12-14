import { Duplex } from 'node:stream'
import { OpenWriteStreamInfo } from 'webdav-server/lib/index.v2'
import axios from 'axios'
import { ITokenInfo } from '../../../user/userstore'

class StreamWrite extends Duplex {
  private ctx: OpenWriteStreamInfo
  private token: ITokenInfo | undefined
  private contents: any[]
  private contentsLength: number
  private file: any
  private arrayBuf: any[]
  private created_now: any[]
  private count: number
  private totalCount: number
  private maxChunkSize: number
  private firstPosition: number
  private lastChunk: number

  constructor(ctx: OpenWriteStreamInfo, token: ITokenInfo | undefined, contents: any[], arrayBuf: any[], file: any, created_now: any[]) {
    super()
    this.ctx = ctx
    this.token = token
    this.contents = contents
    this.contentsLength = 0
    this.arrayBuf = arrayBuf
    this.file = file
    this.created_now = created_now
    this.count = -1
    this.firstPosition = 0
    this.totalCount = 0
    this.lastChunk = 0
    this.maxChunkSize = 10485760
  }

  _read() {
    for (let i = 0; i < this.contents.length; i++) {
      this.push(this.contents[i])
    }
    this.push(null)
  }

  async _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.file && this.token) {
      if (!this.created_now) {
        let buff = Buffer.from(this.arrayBuf)
        if (chunk) {
          this.contents.push(chunk)
          this.contentsLength += chunk.length
        }
        if (this.contentsLength == this.ctx.estimatedSize) {
          if (this.file.upload_url) {
            await axios.put(this.file.upload_url, buff, {
              responseType: 'text',
              timeout: 30000,
              headers: {
                'Content-Type': '',
                Authorization: this.token!.token_type + ' ' + this.token!.access_token
              }
            })
          }
        }
      } else {
        for (let i = 0; chunk.length > i; i++) {
          this.count++
          this.totalCount++
          this.arrayBuf[this.count] = chunk[i]
          let fullChunk = this.count == (this.maxChunkSize - 1)
          let lastByte = this.totalCount == this.ctx.estimatedSize
          if (fullChunk || lastByte) {
            this.arrayBuf.length = this.count + 1
            // todo 分片上传
            // const form_data = new FormData();
            // data = form_data.append("files[]", Buffer.from(this.arrayBuf), "chunk" + i);
            // "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
            // firstPosition:  this.firstPosition
            // secondPosition: this.firstPosition + this.arrayBuf.length - 1
            // "Content-Range": `bytes ${firstPosition}-${secondPosition}/${estimatedSize}`
            this.firstPosition += this.arrayBuf.length
            if (this.ctx.estimatedSize < this.maxChunkSize) {
              this.arrayBuf = []
            }
            this.count = -1
          }
          if (lastByte) {
            if (global.gc) {
              global.gc()
            }
            this.arrayBuf = []
          }
        }
        this.lastChunk = chunk.length
      }
      callback(null)
    }
  }
}

export default StreamWrite