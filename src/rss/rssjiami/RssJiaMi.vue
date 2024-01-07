<script setup lang="ts">
import { ref } from 'vue'
import { useSettingStore } from '../../store'
import MyTags from '../../layout/MyTags.vue'
import MySwitch from '../../layout/MySwitch.vue'
import message from '../../utils/message'
import { DoJiaMi } from './jiami'

const Loading = ref(false)
const encPath = ref('')
const outPath = ref('')
const breakSmall = ref(true)
const encName = ref(false)
const encType = ref('aesctr')
const password = ref('')
const mode = ref<'enc' | 'dec'>('enc')
const matchExtList = ref<string[]>([])

const handleAddExtList = (addList: string[]) => {
  const list: string[] = []
  let ext = ''
  for (let i = 0, maxi = addList.length; i < maxi; i++) {
    ext = addList[i].toLowerCase().trim()
    while (ext.endsWith(' ') || ext.endsWith('.')) ext = ext.substring(0, ext.length - 1)
    while (ext.startsWith(' ') || ext.startsWith('.')) ext = ext.substr(1)
    if (!ext) continue
    ext = '.' + ext
    if (!list.includes(ext)) list.push(ext)
  }
  matchExtList.value = list
}

const handleSelectDir = (inout: boolean) => {
  if (window.WebShowOpenDialogSync) {
    window.WebShowOpenDialogSync(
      {
        title: '选择一个文件夹',
        buttonLabel: '选择',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: useSettingStore().downSavePath
      },
      (result: string[] | undefined) => {
        if (result && result[0]) {
          if (inout) {
            encPath.value = result[0]
          } else {
            outPath.value = result[0]
          }
        }
      }
    )
  }
}

const handleClickJiaMi = async () => {
  if (Loading.value) return
  if (!encPath.value) {
    message.error('没有选择要执行操作的文件夹')
    return
  }
  Loading.value = true
  const resp = await DoJiaMi(
    mode.value, encType.value, encName.value, password.value,
    encPath.value, outPath.value,
    breakSmall.value, matchExtList.value
  )
  if (resp.count > 0) {
    message.success(`成功加密${resp.count}个文件，耗时${resp.time}`, 8)
  }
  Loading.value = false
}
</script>

<template>
  <div class="fullscroll rightbg">
    <div class="settingcard">
      <div class="settinghead">加密或解密文件</div>
      <div class="settingrow">
        <a-radio-group v-model="mode" type="button" tabindex="-1">
          <a-radio tabindex="-1" value="enc">加密文件</a-radio>
          <a-radio tabindex="-1" value="dec">解密文件</a-radio>
        </a-radio-group>
      </div>

      <div class="settingspace"></div>
      <div class="settinghead">0:选择加密算法</div>
      <div class="settingrow">
        <a-radio-group v-model="encType" type="radio" tabindex="-1">
          <a-radio tabindex="-1" value="aesctr">AES-CTR</a-radio>
          <a-radio tabindex="-1" value="rc4">RC4</a-radio>
        </a-radio-group>
      </div>
      <div class="settingspace"></div>
      <div class="settinghead">1:选择需要{{ mode === 'enc' ? '加密' : '解密' }}的文件夹</div>
      <div class="settingrow">
        <a-input-search tabindex="-1" :readonly="true" button-text="选择文件夹" search-button :model-value="encPath"
                        @search="handleSelectDir(true)" />
      </div>
      <div class="settingspace"></div>
      <div class="settinghead">2:选择输出的文件夹</div>
      <div class="settingrow">
        <a-input-search tabindex="-1" :readonly="true" button-text="选择文件夹" search-button :model-value="outPath"
                        @search="handleSelectDir(false)" />
      </div>
      <div v-if="mode == 'enc'">
        <div class="settingspace"></div>
        <div class="settinghead">3:选择要加密的格式</div>
        <div class="settingrow">
          <MyTags :value="matchExtList" :maxlen="20" @update:value="handleAddExtList" />
          <div class="helptxt">默认不填，对文件夹内的全部文件，执行一次加密</div>
          <div class="helptxt">例如填写 .mp4 就是只加密.mp4结尾的文件</div>
        </div>
        <div class="settingspace"></div>
        <div class="settinghead">4:设置一个解密的密码</div>
        <div class="settingrow">
          <a-input v-model="password" tabindex="-1" :style="{ width: '257px' }" placeholder="可以不填" allow-clear />
          <div class="helptxt">默认不填，解密时无需密码直接解密</div>
          <div class="helptxt">填写任意字符串，解密时必须输入正确的密码才能解密</div>
        </div>
        <div class="settingspace"></div>
        <div class="settingrow">
          <MySwitch :value="breakSmall" @update:value="breakSmall = $event"> 自动跳过小于5MB的小文件</MySwitch>
        </div>
        <div class="settingspace"></div>
        <div class="settingrow">
          <MySwitch :value="encName" @update:value="encName = $event"> 加密文件名</MySwitch>
        </div>
      </div>
      <div v-else>
        <div class="settingspace"></div>
        <div class="settinghead">3:选择要解密的格式</div>
        <div class="settingrow">
          <MyTags :value="matchExtList" :maxlen="20" @update:value="handleAddExtList" />
          <div class="helptxt">默认不填，对文件夹内的全部文件，执行一次加密</div>
          <div class="helptxt">例如填写 .mp4 就是只加密.mp4结尾的文件</div>
        </div>
        <div class="settingspace"></div>
        <div class="settinghead">4:解密的密码</div>
        <div class="settingrow">
          <a-input v-model="password" tabindex="-1" :style="{ width: '257px' }" placeholder="没有不填" allow-clear />
          <div class="helptxt">如果文件加密时设置了密码，则解密必须提供密码</div>
        </div>
      </div>

      <div class="settingspace"></div>
      <div class="settingrow">
        <a-button type="primary" tabindex="-1"
                  :status="mode == 'enc'? 'danger' : 'success'"
                  :loading="Loading"
                  @click="handleClickJiaMi">
          {{ mode == 'enc' ? '执行加密' : '执行解密' }}
        </a-button>
      </div>
    </div>

    <div class="settingcard">
      <div class="settinghead">:注意事项</div>
      <div class="settingrow">
        <span class="oporg">警告</span>：仅支持加密文件，不限制文件格式！ <br />
        <span class="oporg">警告</span>：不能把文件夹打包加密成一个文件！ <br />
      </div>
    </div>

    <div class="settingcard">
      <div class="settinghead">:为什么要加密？</div>
      <div class="settingrow">
        网盘里存放了一些个人数据 <br />
        1.想要保护个人隐私，杜绝可能的AI审查 <br />
        2.对文件安全隐私有一定的需求，防止云盘扫描删除，有实时播放视频和下载的需求<br />
      </div>
      <div class="settingspace"></div>
      <div class="settinghead">:我直接打压缩包不就好了吗？</div>
      <div class="settingrow">
        1.加密的文件，可以尝试在小白羊里点击在线恢复文件(无需下载) <br />
        2.加密的文件，使用小白羊下载时会自动解密 <br />
        3.加密的视频文件，小白羊支持直接在线播放 <br />
        4.加密的文件，无法通过其他软件解密查看原始数据 <br />
      </div>
      <div class="settingspace"></div>
      <div class="settinghead">:文件加密方式说明</div>
      <div class="settingrow">
        1.AES-CTR 更加安全，速度最快。推荐 armV8 以上的 cpu 使用，X86 架构的也推荐在支持 AES 指令的机器使用<br />
        2.RC4 由于使用 nodejs 进行实现，性能会稍微差一些。适合在 CPU 不支持 AES 指令的设备中使用<br />
      </div>
    </div>
  </div>
</template>

<style>
.rightbg {
  background: var(--rightbg2);
  padding: 0 20px !important;
}

.helptxt {
  color: var(--color-text-3);
}
</style>
