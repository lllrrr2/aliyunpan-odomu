import { existsSync } from 'fs'
import message from './message'
import is from 'electron-is'
import { spawn, SpawnOptions } from 'child_process'
import mpvAPI from '../module/node-mpv'
import AliFile from '../aliapi/file'
import AliFileCmd from '../aliapi/filecmd'
import levenshtein from 'fast-levenshtein'
import AliDirFileList from '../aliapi/dirfilelist'
import { usePanFileStore, useSettingStore } from '../store'
import { createTmpFile } from './utils'
import { IAliGetFileModel } from '../aliapi/alimodels'
import { getEncType, getProxyUrl, getRawUrl } from './proxyhelper'
import { CleanStringForCmd } from './filehelper'

const PlayerUtils = {
  filterSubtitleFile(name: string, subTitlesList: IAliGetFileModel[]) {
    // 自动加载同名字幕
    const similarity: any = subTitlesList.reduce((min: any, item, index) => {
      // 莱文斯坦距离算法(计算相似度)
      const distance = levenshtein.get(name, item.name, { useCollator: true })
      if (distance < min.distance) {
        min.distance = distance
        min.index = index
      }
      return min
    }, { distance: Infinity, index: -1 })
    return (similarity.index !== -1) ? subTitlesList[similarity.index] : undefined
  },

  async getPlayCursor(user_id: string, drive_id: string, file_id: string) {
    // 获取文件信息
    const info = await AliFile.ApiFileInfo(user_id, drive_id, file_id)
    if (info && typeof info == 'string') {
      message.error('在线预览失败 获取文件信息出错：' + info)
      return undefined
    }
    let play_duration: number = 0
    if (info?.video_media_metadata) {
      play_duration = info?.video_media_metadata.duration
    } else if (info?.user_meta) {
      play_duration = info?.user_meta.duration
    }
    let play_cursor: number = 0
    if (info?.play_cursor) {
      play_cursor = info?.play_cursor
    } else if (info?.user_meta) {
      const meta = JSON.parse(info?.user_meta)
      if (meta.play_cursor) {
        play_cursor = parseFloat(meta.play_cursor)
      }
    }
    // 防止意外跳转
    if (play_duration > 0 && play_duration > 0
      && play_cursor >= play_duration - 10) {
      play_cursor = play_duration - 10
    }
    return { play_duration, play_cursor }
  },
  async getDirFileList(user_id: string, drive_id: string, parent_file_id: string) {
    const dir = await AliDirFileList.ApiDirFileList(user_id, drive_id, parent_file_id, '', 'name asc', '')
    const curDirFileList: IAliGetFileModel[] = []
    for (let item of dir.items) {
      if (item.isDir) continue
      curDirFileList.push(item)
    }
    return curDirFileList.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  },
  async createPlayListFile(user_id: string, file_id: string, duration: number,
                           play_cursor: number, fileExt: string, fileList: IAliGetFileModel[]) {
    let contentStr = ''
    if (fileExt.includes('m3u')) {
      let header = '#EXTM3U\r\n#EXT-X-ALLOW-CACHE:NO\r\n'
      let end = '#EXT-X-ENDLIST\r\n'
      let list = ''
      for (let item of fileList) {
        const encType = getEncType(item)
        const url = getProxyUrl({
          user_id: user_id,
          drive_id: item.drive_id,
          file_id: item.file_id,
          file_size: item.size,
          weifa: item.icon === 'weifa' ? 1 : 0,
          encType: encType
        })
        list += '#EXTINF:0,' + item.name + '\r\n' + url + '\r\n'
      }
      contentStr = header + list + end
    }
    if (fileExt == 'dpl') {
      let header = 'DAUMPLAYLIST'
      let playname = ''
      let playtime = 'playtime=' + play_cursor
      let topindex = 'topindex=0'
      let saveplaypos = `saveplaypos=0`
      let list = ''
      for (let index = 0; index < fileList.length; index++) {
        const item = fileList[index]
        const start = index + 1
        const encType = getEncType(item)
        const url = getProxyUrl({
          user_id: user_id,
          drive_id: item.drive_id,
          file_id: item.file_id,
          file_size: item.size,
          weifa: item.icon === 'weifa' ? 1 : 0,
          encType: encType
        })
        let title = CleanStringForCmd(item.name.trim())
        let listStr = `${start}*file*${url}\r\n${start}*title*${title}\r\n${start}*played*0\r\n`
        if (item.file_id === file_id) {
          playname = 'playname=' + url
          if (duration > 0) {
            listStr += `${start}*duration2*${duration}\r\n`
          }
          if (play_cursor > 0) {
            listStr += `${start}*start*${play_cursor}\r\n`
          }
        }
        list += listStr
      }
      contentStr = `${header}\r\n${playname}\r\n${playtime}\r\n${topindex}\r\n${saveplaypos}\r\n${list}`
    }
    return createTmpFile(contentStr, 'play_list' + '.' + fileExt)
  },
  async mpvPlayer(binary: string, playArgs: any, otherArgs: any, options: SpawnOptions, exitCallBack: any) {
    let { user_id, socketPath, fileList, playInfo } = otherArgs
    let currentTime = 0
    let currentFileId = playInfo.playFileId
    let mpv: mpvAPI = new mpvAPI({
      debug: false,
      verbose: false,
      binary: binary,
      socket: socketPath,
      spawnOptions: options
    }, playArgs)
    try {
      await mpv.start()
      if (useSettingStore().uiVideoEnablePlayerList) {
        await mpv.loadPlaylist(playInfo.playFileListPath)
        await mpv.play()
        mpv.on('status', async (status: { property: string, value: any }) => {
          // console.log('status', status)
          if (status.property === 'playlist-pos' && status.value != -1) {
            // 保存历史
            const item = playInfo.playList[status.value]
            await AliFile.ApiUpdateVideoTime(user_id, playInfo.drive_id, currentFileId, currentTime)
            currentFileId = item && item.file_id || undefined
            if (currentFileId && useSettingStore().uiAutoColorVideo && !item.description.includes('ce74c3c')) {
              AliFileCmd.ApiFileColorBatch(user_id, item.drive_id, item.description ? item.description + ',' + 'ce74c3c' : 'ce74c3c', [currentFileId])
                .then((success) => {
                  usePanFileStore().mColorFiles('ce74c3c', success)
                })
            }
            mpv.once('started', async () => {
              if (currentFileId && useSettingStore().uiVideoPlayerHistory) {
                let playCursorInfo = await this.getPlayCursor(user_id, playInfo.drive_id, currentFileId)
                if (playCursorInfo && playCursorInfo.play_cursor > 0) {
                  await mpv.seek(playCursorInfo.play_cursor, 'absolute')
                }
              }
              if (item && useSettingStore().uiVideoSubtitleMode === 'auto') {
                let filename = item.name
                let subTitlesList = fileList.filter((file: any) => /srt|vtt|ass/.test(file.ext))
                if (subTitlesList.length > 0) {
                  let subTitleFile = this.filterSubtitleFile(filename, subTitlesList)
                  if (subTitleFile) {
                    const data = await getRawUrl(user_id, playInfo.drive_id, subTitleFile.file_id, getEncType(subTitleFile))
                    if (typeof data !== 'string' && data.url && data.url != '') {
                      await mpv.addSubtitles(data.url, 'select', filename)
                    }
                  }
                }
              }
            })
          }
        })
      }
      mpv.on('timeposition', (timeposition: number) => {
        // console.log('timeposition', currentTime)
        currentTime = timeposition
      })
      mpv.on('quit', async () => {
        await AliFile.ApiUpdateVideoTime(user_id, playInfo.drive_id, playInfo.playFileId, currentTime)
        exitCallBack()
      })
      if (useSettingStore().uiVideoPlayerExit) {
        mpv.on('stopped', async () => {
          message.info('播放完毕，自动退出软件', 8)
          await AliFile.ApiUpdateVideoTime(user_id, playInfo.drive_id, playInfo.playFileId, currentTime)
          await mpv.quit()
        })
      }
    } catch (error: any) {
      console.error(error)
      if (error.errcode == 6) {
        message.error('播放失败，重复运行MPV播放器', 8)
      } else {
        message.error(`播放失败，${error.verbose}`)
      }
      exitCallBack()
    }
  },

  commandSpawn(commandStr: string, playArgs: any, options: SpawnOptions, exitCallBack: any) {
    const childProcess: any = spawn(commandStr, playArgs, {
      shell: true,
      windowsVerbatimArguments: true,
      ...options
    })
    childProcess.unref()
    if (exitCallBack) {
      childProcess.once('exit', async () => {
        exitCallBack()
      })
    }
  },

  async startPlayer(command: string,
                    playArgs: any,
                    otherArgs: any,
                    options: SpawnOptions,
                    exitCallBack: any) {
    if ((is.windows() || is.macOS()) && !existsSync(command)) {
      message.error(`启动失败，找不到文件, ${command}`)
      return
    }
    const argsToStr = (args: string) => is.windows() ? `"${args}"` : `'${args}'`
    const isMPV = command.toLowerCase().includes('mpv')
    let commandStr
    if (is.macOS()) {
      commandStr = `open -a ${argsToStr(command)} ${command.includes('mpv.app') ? '--args ' : ''}`
    } else {
      commandStr = `${argsToStr(command)}`
    }
    if (useSettingStore().uiVideoEnablePlayerList || useSettingStore().uiVideoPlayerHistory) {
      isMPV ? await this.mpvPlayer(commandStr, playArgs, otherArgs, options, exitCallBack) : this.commandSpawn(commandStr, playArgs, options, exitCallBack)
    } else {
      this.commandSpawn(commandStr, playArgs, options, exitCallBack)
    }
  }
}
export default PlayerUtils