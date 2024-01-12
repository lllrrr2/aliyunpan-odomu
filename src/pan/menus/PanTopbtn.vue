<script setup lang='ts'>
import { computed } from 'vue'
import { handleUpload } from '../topbtns/topbtn'
import {
  modalCreatNewAlbum,
  modalCreatNewDir,
  modalCreatNewFile,
  modalDaoRuShareLink,
  modalShowShareLink
} from '../../utils/modal'
import AliShare from '../../aliapi/share'
import { usePanTreeStore } from '../../store'
import message from '../../utils/message'

const props = defineProps({
  dirtype: {
    type: String,
    required: true
  },
  inputselectType: {
    type: String,
    required: true
  },
  inputpicType: {
    type: String,
    required: true
  },
  isselected: {
    type: Boolean,
    required: true
  }
})
const isShowBtn = computed(() => {
  return (props.dirtype === 'pic' && props.inputpicType != 'mypic')
    || props.dirtype === 'mypic' || props.dirtype === 'pan'
})

const handleClickBottleFish = async () => {
  const pantreeStore = usePanTreeStore()
  let resp = await AliShare.ApiShareBottleFish(pantreeStore.user_id)
  if (typeof resp !== 'string') {
    // 打开分享
    let share_id = resp.shareId
    AliShare.ApiGetShareToken(share_id, '')
      .then((share_token) => {
        if (!share_token || share_token.startsWith('，')) {
          message.error('解析链接出错' + share_token)
        } else {
          modalShowShareLink(share_id, '', share_token, true, [], false)
        }
      })
      .catch((err: any) => {
        message.error('解析链接出错', err)
      })
  } else {
    message.info(resp)
  }
}
</script>

<template>
  <div v-show="!isselected && ['pan', 'pic', 'mypic'].includes(dirtype)" class='toppanbtn'>
    <a-button v-if="inputselectType.includes('resource')" type='text' size='small' tabindex='-1'
              @click="handleClickBottleFish">
      <i class='iconfont iconnotification' />好运瓶
    </a-button>
    <a-dropdown v-if='dirtype !== "pic"' trigger='hover' class='rightmenu' position='bl'>
      <a-button v-show="!dirtype.includes('pic')" type='text' size='small' tabindex='-1'>
        <i class='iconfont iconplus' />新建<i class='iconfont icondown' />
      </a-button>
      <template #content>
        <a-doption value='newfile' title='Ctrl+N' @click='modalCreatNewFile'>
          <template #icon><i class='iconfont iconwenjian' /></template>
          <template #default>新建文件</template>
        </a-doption>
        <a-doption value='newfolder' title='Ctrl+Shift+N' @click="() => modalCreatNewDir('folder')">
          <template #icon><i class='iconfont iconfile-folder' /></template>
          <template #default>新建文件夹</template>
        </a-doption>
        <a-doption value='newdatefolder' @click="() => modalCreatNewDir('datefolder')">
          <template #icon><i class='iconfont iconfolderadd' /></template>
          <template #default>日期+序号</template>
        </a-doption>
      </template>
    </a-dropdown>
    <a-button v-else-if="dirtype === 'pic' && inputpicType != 'pic_root'"
              type='text' size='small' tabindex='-1'
              @click='modalCreatNewAlbum'>
      <i class='iconfont iconplus' />创建相册
    </a-button>
    <a-dropdown v-if='!dirtype.includes("pic")' trigger='hover' class='rightmenu' position='bl'>
      <a-button type='text' size='small' tabindex='-1'>
        <i class='iconfont iconupload' />上传<i class='iconfont icondown' />
      </a-button>
      <template #content>
        <a-dgroup title="普通上传">
          <a-doption value='uploadfile' title='Ctrl+U'
                     @click="() => handleUpload('file')">
            <template #icon><i class='iconfont iconwenjian' /></template>
            <template #default>上传文件</template>
          </a-doption>
          <a-doption value='uploaddir' title='Ctrl+Shift+U' @click="() => handleUpload('folder')">
            <template #icon><i class='iconfont iconfile-folder' /></template>
            <template #default>上传文件夹</template>
          </a-doption>
        </a-dgroup>
        <a-dgroup title="加密上传">
          <a-doption value='uploadfile' title='Ctrl+J'
                     @click="() => handleUpload('file', 'xbyEncrypt1')">
            <template #icon><i class='iconfont iconwenjian' /></template>
            <template #default>上传文件（加密）</template>
          </a-doption>
          <a-doption value='uploaddir' title='Ctrl+Shift+J' @click="() => handleUpload('folder', 'xbyEncrypt1')">
            <template #icon><i class='iconfont iconfile-folder' /></template>
            <template #default>上传文件夹（加密）</template>
          </a-doption>
        </a-dgroup>
        <a-dgroup title="私密上传">
          <a-doption value='uploadfile' title='Ctrl+M'
                     @click="() => handleUpload('file', 'xbyEncrypt2')">
            <template #icon><i class='iconfont iconwenjian' /></template>
            <template #default>上传文件（私密）</template>
          </a-doption>
          <a-doption value='uploaddir' title='Ctrl+Shift+M' @click="() => handleUpload('folder','xbyEncrypt2')">
            <template #icon><i class='iconfont iconfile-folder' /></template>
            <template #default>上传文件夹（私密）</template>
          </a-doption>
        </a-dgroup>
      </template>
    </a-dropdown>
    <a-button v-if="isShowBtn && dirtype.includes('pic')" type='text' size='small' tabindex='-1' title='Ctrl+L'
              @click='handleUpload("pic_file")'>
      <i class='iconfont iconwenjian' />上传照片/视频
    </a-button>
    <a-button v-if="!dirtype.includes('pic')" type='text' size='small' tabindex='-1' title='Ctrl+L'
              @click='modalDaoRuShareLink()'>
      <i class='iconfont iconlink2' />导入分享
    </a-button>
  </div>
</template>
<style></style>
