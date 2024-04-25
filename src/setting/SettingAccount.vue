<script setup lang='ts'>
import message from '../utils/message'
import UserDAL, { UserTokenMap } from '../user/userdal'
import { ITokenInfo, useSettingStore, useUserStore } from '../store'
import { copyToClipboard, openExternal } from '../utils/electronhelper'
import Db from '../utils/db'
import fs from 'node:fs'
import path from 'path'
import { decodeName, encodeName } from '../module/flow-enc/utils'
import { localPwd } from '../utils/aria2c'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import AliUser from '../aliapi/user'
import MySwitch from '../layout/MySwitch.vue'
import * as url from 'node:url'

const settingStore = useSettingStore()
const qrCodeLoading = ref(false)
const intervalId = ref()
const qrCodeUrl = ref('')
const qrCodeStatusType = ref()
const qrCodeStatusTips = ref()

const cb = (val: any) => {
  settingStore.updateStore(val)
}

const openWebUrl = (type: string) => {
  switch (type) {
    case 'developer':
      openExternal('https://www.aliyundrive.com/developer')
      break
    case 'pkce':
      openExternal('https://www.yuque.com/aliyundrive/zpfszx/eam8ls1lmawwwksv')
      break
    case 'AList':
      openExternal('https://alist.nn.ci/tool/aliyundrive/request.html')
      break
    case 'authUrl':
      let authUrl = url.format({
        host: 'https://openapi.alipan.com',
        pathname: '/oauth/authorize',
        query: {
          client_id: settingStore.uiOpenApiClientId,
          scope: 'user:base,file:all:read,file:all:write',
          code_challenge: settingStore.uiOpenApiCodeChallenge,
          code_challenge_method: settingStore.uiOpenApiCodeChallengeMethod,
          response_type: 'code',
          redirect_uri: settingStore.uiOpenApiRedirectUri
        }
      })
      openExternal(authUrl)
      break
  }
}

const copyCookies = async () => {
  let cookies = await window.WebGetCookies({ url: 'https://www.aliyundrive.com' }) as []
  if (cookies.length == 0) cookies = await window.WebGetCookies({ url: 'https://www.aliyundrive.com' }) as []
  if (cookies.length > 0) {
    let cookiesText = ''
    cookies.forEach(cookie => {
      cookiesText += cookie['name'] + '=' + cookie['value'] + ';'
    })
    copyToClipboard(cookiesText)
    message.success('当前账号的Cookies已复制到剪切板')
  } else {
    message.error('当前账号的Cookies不存在')
  }
}

const handlerAccountImport = () => {
  window.WebShowOpenDialogSync({
    title: '选择需要导入的账户文件',
    buttonLabel: '导入选中的账户文件',
    filters: [{ name: 'user.db', extensions: ['db'] }],
    properties: ['openFile', 'multiSelections', 'showHiddenFiles', 'noResolveAliases', 'treatPackageAsDirectory', 'dontAddToRecent']
  }, async (files: string[] | undefined) => {
    if (files && files.length > 0) {
      try {
        // 获取内容
        let userList: ITokenInfo[] = []
        let uniqueUserIds = new Set()
        for (let filePath of files) {
          let readData = fs.readFileSync(filePath, 'utf-8')
          let parsedData: any = JSON.parse(<string>decodeName(localPwd, 'aesctr', readData))
          if (Array.isArray(parsedData) && parsedData.every(item => item.hasOwnProperty('access_token'))) {
            let filteredData: ITokenInfo[] = parsedData.filter((item: ITokenInfo) => {
              if (!uniqueUserIds.has(item.user_id)) {
                uniqueUserIds.add(item.user_id)
                return true
              }
              return false
            })
            userList.push(...filteredData)
          }
        }
        if (userList.length > 0) {
          // 设置UserTokenMap
          for (let token of userList) {
            if (token.user_id) {
              UserTokenMap.set(token.user_id, token)
            }
          }
          // 导入到数据库
          Db.saveUserBatch(userList).then(() => {
            window.WinMsgToUpload({ cmd: 'ClearUserToken' })
            window.WinMsgToDownload({ cmd: 'ClearUserToken' })
          }).catch()
          await UserDAL.UserLogin(userList[0])
          message.success('导入用户账户数据成功')
        } else {
          message.error('数据错误，导入用户账户数据失败')
        }
      } catch (err) {
        message.error('数据错误，导入用户账户数据失败')
      }
    }
  })
}

const handlerAccountExport = () => {
  if (window.WebShowOpenDialogSync) {
    window.WebShowOpenDialogSync(
      {
        title: '选择一个文件夹，保存导出的数据',
        buttonLabel: '选择',
        properties: ['openDirectory', 'createDirectory']
      },
      (result: string[] | undefined) => {
        if (result && result[0]) {
          let exportFile = path.join(result[0], 'user.db')
          let userList = JSON.stringify(UserDAL.GetUserList())
          let data = encodeName(localPwd, 'aesctr', userList)
          fs.writeFileSync(exportFile, data)
          message.success('导出所有用户账户数据成功')
        }
      }
    )
  }
}

const refreshStatus = () => {
  qrCodeLoading.value = false
  qrCodeUrl.value = ''
  qrCodeStatusType.value = 'info'
  qrCodeStatusTips.value = ''
}

const refreshQrCode = async () => {
  let client_id = 'c58bfbdd05954e8a9ec5d4d58b1e9de6'
  let client_secret = '7234e9215d20426dbee11dfadc17b49a'
  const { uiEnableOpenApiType, uiOpenApiClientId, uiOpenApiClientSecret } = storeToRefs(settingStore)
  if (uiEnableOpenApiType.value === 'custom') {
    if (!uiOpenApiClientId.value || !uiOpenApiClientSecret.value) {
      message.error('客户端ID或客户端密钥不能为空！')
      return
    }
    client_id = uiOpenApiClientId.value
    client_secret = uiOpenApiClientSecret.value
  } else {
    client_id = 'c58bfbdd05954e8a9ec5d4d58b1e9de6'
    client_secret = '7234e9215d20426dbee11dfadc17b49a'
  }
  qrCodeLoading.value = true
  const token = await UserDAL.GetUserTokenFromDB(useUserStore().user_id)
  if (!token) {
    refreshStatus()
    message.error('未登录账号，该功能无法开启')
    return
  }
  const codeUrl = await AliUser.OpenApiQrCodeUrl(client_id, client_secret)
  if (!codeUrl) {
    refreshStatus()
    return
  }
  qrCodeLoading.value = false
  qrCodeUrl.value = codeUrl
  qrCodeStatusType.value = 'info'
  qrCodeStatusTips.value = '状态：等待扫码登录'
  // 监听状态
  intervalId.value = setInterval(async () => {
    const { authCode, statusCode, statusType, statusTips } = await AliUser.OpenApiQrCodeStatus(codeUrl)
    if (!statusCode) {
      refreshStatus()
      clearInterval(intervalId.value)
      return
    }
    qrCodeStatusType.value = statusType
    qrCodeStatusTips.value = statusTips
    if (statusCode === 'QRCodeExpired') {
      message.error('二维码已超时，请刷新二维码')
      clearInterval(intervalId.value)
      refreshStatus()
      return
    }
    if (authCode && statusCode === 'LoginSuccess') {
      await AliUser.OpenApiLoginByAuthCode(token, client_id, client_secret, authCode, true)
      clearInterval(intervalId.value)
      refreshStatus()
      message.success('获取OpenApiToken成功')
    }
  }, 1500)
}

const closeQrCode = () => {
  refreshStatus()
  clearInterval(intervalId.value)
}
</script>

<template>
  <div class='settingcard'>
    <div class='settinghead'>:阿里云盘账号</div>
    <div class='settingrow'>
      <a-button type='outline' size='small' tabindex='-1' @click='copyCookies()'>
        复制当前账号Cookies
      </a-button>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>:账号导入导出</div>
    <a-popover position="bottom">
      <i class="iconfont iconbulb" />
      <template #content>
        <div>
          可以一键恢复所有账户的数据（加密）<br />
          <hr />
          <div class="hrspace"></div>
          <span class="opred">批量导入导出所有账户的数据</span><br />
        </div>
      </template>
    </a-popover>
    <div class="settingrow">
      <a-button type='outline' style='margin-right: 12px' status="danger" size='small' tabindex='-1'
                @click='handlerAccountExport'>
        导出账号
      </a-button>
      <a-button type='outline' size='small' status="success" tabindex='-1' @click='handlerAccountImport'>
        导入账号
      </a-button>
    </div>
    <div class='settingspace'></div>
    <div class='settinghead'>:阿里云盘开放平台</div>
    <a-popover position='bottom'>
      <i class='iconfont iconbulb' />
      <template #content>
        <div style='min-width: 400px'>
          <span class='opblue'>OpenApi</span>：阿里云盘开放平台API<br />
          说明：获取AccessToken后填入即可，仅用于加速视频播放和文件下载<br />
          官方文档：<span class='opblue' @click="openWebUrl('developer')">开发者门户</span>
          <br />
          <div class='hrspace'></div>
          <span class='opred'>注意</span>：需要申请OpenApi开发者账户
          <div class='hrspace'></div>
        </div>
      </template>
    </a-popover>
    <div class='settingrow'>
      <MySwitch :value='settingStore.uiEnableOpenApi' @update:value='cb({ uiEnableOpenApi: $event })'>
        启用OpenApi（加快视频播放和下载）
      </MySwitch>
    </div>
    <template v-if="settingStore.uiEnableOpenApi">
      <div class='settingspace'></div>
      <div class='settinghead'>:OpenApi配置</div>
      <div class='settingrow'>
        <a-radio-group v-show='settingStore.uiEnableOpenApiType'
                       type='button' tabindex='-1'
                       :model-value='settingStore.uiEnableOpenApiType'
                       @update:model-value='cb({ uiEnableOpenApiType: $event })'>
          <a-radio tabindex='-1' value='inline'>内置方式</a-radio>
          <a-radio tabindex='-1' value='custom'>自定义方式</a-radio>
          <a-radio tabindex='-1' value='pkce'>PKCE授权</a-radio>
        </a-radio-group>
        <template v-if="settingStore.uiEnableOpenApiType == 'custom'">
          <div class='settingspace'></div>
          <div class='settinghead'>:客户端ID(ClientId)</div>
          <div class='settingrow'>
            <a-input v-model.trim='settingStore.uiOpenApiClientId'
                     :style="{ width: '430px' }"
                     placeholder='客户端ID（该项必填）'
                     @update:model-value='cb({ uiOpenApiClientId: $event })' />
            <div class='settingspace'></div>
            <div class='settinghead'>:客户端密钥(ClientSecret)</div>
            <div class='settingrow'>
              <a-input
                v-model.trim='settingStore.uiOpenApiClientSecret'
                :style="{ width: '430px' }"
                placeholder='客户端密钥（该项必填）'
                @update:model-value='cb({ uiOpenApiClientSecret: $event })' />
            </div>
          </div>
        </template>
        <template v-if="settingStore.uiEnableOpenApiType === 'pkce'">
          <div class='settingspace'></div>
          <div class='settinghead'>:客户端ID(ClientId)</div>
          <div class='settingrow'>
            <a-input v-model.trim='settingStore.uiOpenApiClientId'
                     :style="{ width: '430px' }"
                     placeholder='客户端ID（该项必填）'
                     @update:model-value='cb({ uiOpenApiClientId: $event })' />
          </div>
          <div class='settingspace'></div>
          <div class='settinghead'>:校验码(CodeChallenge)</div>
          <a-popover position='right'>
            <i class='iconfont iconbulb' />
            <template #content>
              一个随机字符串（该项必填）<br />
              <span class='opred'>注意</span>：该项必填
            </template>
          </a-popover>
          <div class='settingrow'>
            <a-input v-model.trim='settingStore.uiOpenApiCodeChallenge'
                     :style="{ width: '430px' }"
                     placeholder='一个随机字符串（该项必填）'
                     @update:model-value='cb({ uiOpenApiCodeChallenge: $event })' />
          </div>
          <div class='settingspace'></div>
          <div class='settinghead'>:校验码方法(CodeChallengeMethod)</div>
          <div class='settingrow'>
            <a-radio-group type='button' tabindex='-1'
                           :model-value='settingStore.uiOpenApiCodeChallengeMethod'
                           @update:model-value='cb({ uiOpenApiCodeChallengeMethod: $event })'>
              <a-radio tabindex='-1' value='plain'>Plain</a-radio>
              <a-radio tabindex='-1' value='S256'>S256</a-radio>
            </a-radio-group>
          </div>
          <div class='settingspace'></div>
          <div class='settinghead'>:网页授权(获取授权码)</div>
          <a-popover position='right'>
            <i class='iconfont iconbulb' />
            <template #content>
              官方文档:
              <span class='opblue' @click="openWebUrl('pkce')">无后端服务授权模式【点击查看】</span>
              <br />
              <div class='hrspace'></div>
              <span class='opred'>1. 填写授权码(Code)后无法点击，需要删除</span><br />
              <span class='opred'>2. 多次点击会导致AccessToken失效，需要重新获取授权码(Code)</span><br />
              3. 只能获取到AccessToken【无法自动刷新，有效期30天】
            </template>
          </a-popover>
          <div class='settingrow' style='display:flex;'>
            <a-button :disabled='settingStore.uiOpenApiAuthCode != ""'
                      type='outline' size='small' tabindex='-1'
                      @click='openWebUrl("authUrl")'>
              <template #icon>
                <i class='iconfont iconcloud_success' />
              </template>
              打开授权网址
            </a-button>
          </div>
          <div class='settingspace'></div>
          <div class='settinghead'>:授权码(Code)</div>
          <a-popover position='right'>
            <i class='iconfont iconbulb' />
            <template #content>
              打开网页授权后填写返回的授权码<br />
              <span class='opred'>注意</span>：该项必填
            </template>
          </a-popover>
          <div class='settingrow'>
            <a-input v-model.trim='settingStore.uiOpenApiAuthCode'
                     :style="{ width: '430px' }"
                     placeholder='网页授权后填写授权码（该项必填）'
                     allow-clear
                     @update:model-value='cb({ uiOpenApiAuthCode: $event })' />
          </div>
        </template>
        <template v-if="settingStore.uiEnableOpenApiType !== 'pkce'">
          <div class='settingspace'></div>
          <div class='settinghead'>:二维码(手机扫码)</div>
          <div class='settingrow' style='display:flex;'>
            <a-button type='outline' size='small' tabindex='-1' :loading='qrCodeLoading' @click='refreshQrCode()'>
              <template #icon>
                <i class='iconfont iconreload-1-icon' />
              </template>
              刷新二维码
            </a-button>
            <a-button style='margin-left: 10px' status='success' type='outline' v-if='qrCodeUrl' size='small'
                      tabindex='-1' @click='closeQrCode()'>
              <template #icon>
                <i class='iconfont iconclose' />
              </template>
              关闭二维码
            </a-button>
          </div>
          <div class='settingrow' v-if='qrCodeUrl'>
            <div class='settingspace'></div>
            <a-alert :type='qrCodeStatusType'> {{ qrCodeStatusTips }}</a-alert>
            <a-image
              width='200'
              height='200'
              :hide-footer='true'
              :preview='false'
              :src="qrCodeUrl || 'some-error.png'" />
          </div>
        </template>
        <div class='settingspace'></div>
        <div class='settinghead'>:AccessToken</div>
        <div class='settingrow'>
          <a-input v-model.trim='useUserStore().GetUserToken.open_api_access_token'
                   @keydown='(e:any) => e.stopPropagation()'
                   tabindex='-1'
                   :style="{ width: '430px' }"
                   placeholder='没有不填，有效期3个小时'
                   disabled />
        </div>
        <div class='settingspace'></div>
        <div class='settinghead'>:RefreshToken</div>
        <div class='settingrow'>
          <a-input v-model.trim='useUserStore().GetUserToken.open_api_refresh_token'
                   @keydown='(e:any) => e.stopPropagation()'
                   tabindex='-1'
                   :style="{ width: '430px' }"
                   placeholder='用于刷新AccessToken'
                   disabled />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>

</style>