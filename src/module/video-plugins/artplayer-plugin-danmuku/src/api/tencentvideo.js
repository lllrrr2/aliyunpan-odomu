import axios from 'axios'
import whacko from 'whacko'
import urlmodule from 'url'

import { content_template } from './utils'

const example_urls = [
  'https://v.qq.com/x/cover/53q0eh78q97e4d1/x00174aq5no.html',//api lens 50
  'https://v.qq.com/x/cover/mzc00200fph94nw/l00448ijvve.html'//api lens 91
]

class Tencentvideo {

  constructor() {
    this.name = '腾讯视频'
    this.domain = 'v.qq.com'
    this.title = ''
    this.content = ''
    this.error_msg = ''
  }

  async resolve(url) {
    const api_danmaku_base = 'https://dm.video.qq.com/barrage/base/'
    const api_danmaku_segment = 'https://dm.video.qq.com/barrage/segment/'
    const q = urlmodule.parse(url, true)
    const path = q.pathname.split('/')
    let vid
    if (q.query.vid) {
      vid = q.query.vid
    } else {
      vid = path.slice(-1)[0].split('.')[0]
    }
    let res = await axios.get(url)
    const $ = whacko.load(res.data, null, false)
    this.title = $('title')[0].children[0].data.split('_')[0]
    // console.log('vid:', vid, 'title:', this.title)
    try {
      res = await axios.get(api_danmaku_base + vid)
    } catch (e) {
      if (e.response.status && e.response.status === 404) {
        this.error_msg = '好像没有弹幕哦'
        return
      } else throw e
    }

    let promises = []
    let list = Object.values(res.data.segment_index)
    for (const item of list) {
      promises.push(axios.get(`${api_danmaku_segment}${vid}/${item.segment_name}`))
    }
    return promises
  }

  async parse(promises) {
    let contents = []
    //筛选出成功的请求
    let datas = (await Promise.allSettled(promises))
      .filter(x => x.status === 'fulfilled')
      .map(x => x.value.data)

    for (const data of datas) {
      for (const item of data.barrage_list) {
        const content = JSON.parse(JSON.stringify(content_template))
        content.time = item.time_offset / 1000
        if (item.content_style.color) {
          const content_style = JSON.stringify(item.content_style.color)
          // todo 有颜色
          // console.log('有颜色', content_style)
        }
        content.text = item.content
        contents.push(content)
      }
    }
    // contents = make_response(contents);
    return contents
  }

  async work(url) {
    const promises = await this.resolve(url)
    if (!this.error_msg) {
      // console.log(this.name, 'api lens:', promises.length)
      this.content = await this.parse(promises)
    }
    return {
      title: this.title,
      content: this.content,
      msg: this.error_msg ? this.error_msg : 'ok'
    }
  }
}

export default new Tencentvideo()