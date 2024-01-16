<script setup lang="ts">
import { ref } from 'vue'
import { KeyboardState, useAppStore, useKeyboardStore, useUserStore, useWinStore } from '../../store'
import ShareDAL from './ShareDAL'
import {
  onHideRightMenuScroll,
  onShowRightMenu,
  TestCtrl,
  TestKey,
  TestKeyboardScroll,
  TestKeyboardSelect
} from '../../utils/keyboardhelper'
import { copyToClipboard, openExternal } from '../../utils/electronhelper'
import message from '../../utils/message'

import { Tooltip as AntdTooltip } from 'ant-design-vue'
import 'ant-design-vue/es/tooltip/style/css'
import { modalShowShareLink } from '../../utils/modal'
import { GetShareUrlFormate } from '../../utils/shareurl'
import useShareHistoryStore from './ShareHistoryStore'
import AliShare from '../../aliapi/share'

const viewlist = ref()
const inputsearch = ref()

const appStore = useAppStore()
const winStore = useWinStore()
const shareHistoryStore = useShareHistoryStore()

const keyboardStore = useKeyboardStore()
keyboardStore.$subscribe((_m: any, state: KeyboardState) => {
  if (appStore.appTab != 'share' || appStore.GetAppTabMenu != 'ShareHistoryRight') return
  if (TestCtrl('a', state.KeyDownEvent, () => shareHistoryStore.mSelectAll())) return
  if (TestCtrl('b', state.KeyDownEvent, handleBrowserLink)) return
  if (TestCtrl('c', state.KeyDownEvent, handleCopySelectedLink)) return
  if (TestCtrl('f', state.KeyDownEvent, () => inputsearch.value.focus())) return
  if (TestKey('f3', state.KeyDownEvent, () => inputsearch.value.focus())) return
  if (TestKey(' ', state.KeyDownEvent, () => inputsearch.value.focus())) return
  if (TestKey('f5', state.KeyDownEvent, handleRefresh)) return
  if (TestKeyboardSelect(state.KeyDownEvent, viewlist.value, shareHistoryStore, handleOpenLink)) return
  if (TestKeyboardScroll(state.KeyDownEvent, viewlist.value, shareHistoryStore)) return
})
const handleRefresh = () => ShareDAL.aReloadShareHistory(useUserStore().user_id, true)
const handleSelectAll = () => shareHistoryStore.mSelectAll()
const handleOrder = (order: string) => shareHistoryStore.mOrderListData(order)
const handleSelect = (share_id: string, event: any, isCtrl: boolean = false) => {
  onHideRightMenuScroll()
  shareHistoryStore.mMouseSelect(share_id, event.ctrlKey || isCtrl, event.shiftKey)
}
const onSelectCancel = () => {
  onHideRightMenuScroll()
  shareHistoryStore.ListSelected.clear()
  shareHistoryStore.ListFocusKey = ''
  shareHistoryStore.mRefreshListDataShow(false)
}
const handleOpenLink = (share: any) => {
  if (share && share.share_id) {
    // donothing
  } else {
    share = shareHistoryStore.GetSelectedFirst()
  }
  if (!share.share_id) {
    message.error('没有选中分享链接！')
  } else {
    modalShowShareLink(share.share_id, share.share_pwd, '', true, [], false)
  }
}
const handleSaveMyImport = () => {
  const first = shareHistoryStore.GetSelectedFirst()
  if (!first) return
  if (first.share_id) {
    AliShare.ApiGetShareAnonymous(first.share_id).then((info) => {
      ShareDAL.SaveOtherShare('', info, true)
    })
  }
}
const handleCopySelectedLink = () => {
  const list = shareHistoryStore.GetSelected()
  let link = ''
  for (let i = 0, maxi = list.length; i < maxi; i++) {
    const item = list[i]
    link += GetShareUrlFormate(item.share_name, 'https://www.aliyundrive.com/s/' + item.share_id, '') + '\n'
  }
  if (list.length == 0) {
    message.error('没有选中分享链接！')
  } else {
    copyToClipboard(link)
    message.success('分享链接已复制到剪切板(' + list.length.toString() + ')')
  }
}
const handleBrowserLink = () => {
  const first = shareHistoryStore.GetSelectedFirst()
  if (!first) return
  if (first.share_id) {
    openExternal('https://www.aliyundrive.com/s/' + first.share_id)
  }
}

const handleSearchInput = (value: string) => {
  shareHistoryStore.mSearchListData(value)
  viewlist.value.scrollIntoView(0)
}
const handleSearchEnter = (event: any) => {
  event.target.blur()
  viewlist.value.scrollIntoView(0)
}
const handleRightClick = (e: { event: MouseEvent; node: any }) => {
  const key = e.node.key
  if (!shareHistoryStore.ListSelected.has(key)) shareHistoryStore.mMouseSelect(key, false, false)
  onShowRightMenu('rightsharehistorymenu', e.event.clientX, e.event.clientY)
}
</script>

<template>
  <div style="height: 7px"></div>
  <div class='toppanbtns' style='height: 26px'>
    <div style="min-height: 26px; max-width: 100%; flex-shrink: 0; flex-grow: 0">
      <div class="toppannav">
        <div class="toppannavitem" title="历史导入">
          <span> 历史导入 </span>
        </div>
      </div>
    </div>
    <div class='flex flexauto'></div>
  </div>
  <div style="height: 14px"></div>
  <div class="toppanbtns" style="height: 26px">
    <div class="toppanbtn">
      <a-button type="text" size="small" tabindex="-1" :loading="shareHistoryStore.ListLoading" title="F5"
                @click="handleRefresh">
        <template #icon>
          <i class="iconfont iconreload-1-icon" />
        </template>
        刷新
      </a-button>
    </div>
    <div v-show="shareHistoryStore.IsListSelected" class="toppanbtn">
      <a-button type="text" size="small" tabindex="-1" title="Ctrl+O" @click="handleOpenLink"><i
        class="iconfont iconchakan" />查看
      </a-button>
      <a-button type="text" size="small" tabindex="-1" title="保存到我的导入" @click="handleSaveMyImport">
        <i class="iconfont iconxuanzhuan" />保存导入
      </a-button>
      <a-button type="text" size="small" tabindex="-1" title="Ctrl+C" @click="handleCopySelectedLink"><i
        class="iconfont iconcopy" />复制链接
      </a-button>
      <a-button type="text" size="small" tabindex="-1" title="Ctrl+B" @click="handleBrowserLink"><i
        class="iconfont iconchrome" />浏览器
      </a-button>
    </div>
    <div style="flex-grow: 1"></div>
    <div style="flex-grow: 1"></div>
    <div class="toppanbtn">
      <a-input-search ref="inputsearch" tabindex="-1" size="small" title="Ctrl+F / F3 / Space" placeholder="快速筛选"
                      v-model="shareHistoryStore.ListSearchKey" allow-clear
                      @clear='(e:any)=>handleSearchInput("")'
                      @input="(val:any)=>handleSearchInput(val as string)"
                      @press-enter="handleSearchEnter"
                      @keydown.esc=";($event.target as any).blur()" />
    </div>
    <div></div>
  </div>
  <div style="height: 9px"></div>
  <div class="toppanarea">
    <div style="margin: 0 3px">
      <AntdTooltip title="点击全选" placement="left">
        <a-button shape="circle" type="text" tabindex="-1" class="select all" title="Ctrl+A" @click="handleSelectAll">
          <i :class="shareHistoryStore.IsListSelectedAll ? 'iconfont iconrsuccess' : 'iconfont iconpic2'" />
        </a-button>
      </AntdTooltip>
    </div>
    <div class="selectInfo">{{ shareHistoryStore.ListDataSelectCountInfo }}</div>
    <div style='margin: 0 2px'>
      <a-button shape='square' v-if='shareHistoryStore.ListSelected.size > 0'
                type='text' tabindex='-1' class='qujian' status='normal' @click='onSelectCancel'>
        取消已选
      </a-button>
    </div>
    <div style="flex-grow: 1"></div>
    <div :class="'cell sharestate order ' + (shareHistoryStore.ListOrderKey == 'save' ? 'active' : '')"
         @click="handleOrder('save')">
      保存数
      <i class="iconfont iconxia" />
    </div>
    <div :class="'cell sharestate order ' + (shareHistoryStore.ListOrderKey == 'preview' ? 'active' : '')"
         @click="handleOrder('preview')">
      预览数
      <i class="iconfont iconxia" />
    </div>
    <div :class="'cell sharestate order ' + (shareHistoryStore.ListOrderKey == 'browse' ? 'active' : '')"
         @click="handleOrder('browse')">
      浏览数
      <i class="iconfont iconxia" />
    </div>
    <div :class="'cell sharetime order ' + (shareHistoryStore.ListOrderKey == 'ctime' ? 'active' : '')"
         @click="handleOrder('ctime')">
      创建时间
      <i class="iconfont iconxia" />
    </div>
    <div :class="'cell sharetime order ' + (shareHistoryStore.ListOrderKey == 'mtime' ? 'active' : '')"
         @click="handleOrder('mtime')">
      修改时间
      <i class="iconfont iconxia" />
    </div>
    <div :class="'cell sharetime'">
      创建者
    </div>
    <div class="cell pr"></div>
  </div>
  <div class="toppanlist" @keydown.space.prevent="() => true">
    <a-list
      ref="viewlist"
      :bordered="false"
      :split="false"
      :max-height="winStore.GetListHeightNumber"
      :virtual-list-props="{
        height: winStore.GetListHeightNumber,
        fixedSize: true,
        estimatedSize: 50,
        threshold: 1,
        itemKey: 'share_id'
      }"
      style="width: 100%"
      :data="shareHistoryStore.ListDataShow"
      tabindex="-1"
      @scroll="onHideRightMenuScroll">
      <template #empty>
        <a-empty description="没导入过任何分享链接" />
      </template>
      <template #item="{ item, index }">
        <div :key="item.share_id" class="listitemdiv">
          <div
            :class="'fileitem' + (shareHistoryStore.ListSelected.has(item.share_id) ? ' selected' : '') + (shareHistoryStore.ListFocusKey == item.share_id ? ' focus' : '')"
            @click="handleSelect(item.share_id, $event)"
            @contextmenu="(event:MouseEvent)=>handleRightClick({event,node:{key:item.share_id}} )">
            <div style="margin: 2px">
              <a-button shape="circle" type="text" tabindex="-1" class="select" :title="index"
                        @click.prevent.stop="handleSelect(item.share_id, $event, true)">
                <i
                  :class="shareHistoryStore.ListSelected.has(item.share_id) ? 'iconfont iconrsuccess' : 'iconfont iconpic2'" />
              </a-button>
            </div>
            <div class="fileicon">
              <i class="iconfont iconlink2" aria-hidden="true"></i>
            </div>
            <div class="filename">
              <div :title="'https://www.aliyundrive.com/s/' + item.share_id" @click="handleOpenLink(item)">
                {{ item.share_name }}
              </div>
            </div>
            <div class="cell sharestate active">{{ item.save_count }}</div>
            <div class="cell sharestate active">{{ item.preview_count }}</div>
            <div class="cell sharestate active">{{ item.browse_count }}</div>
            <div class="cell sharetime">{{ item.gmt_created }}</div>
            <div class="cell sharetime">{{ item.gmt_modified }}</div>
            <div class="cell sharestate">{{ item.creator_name }}</div>
          </div>
        </div>
      </template>
    </a-list>

    <a-dropdown id="rightsharehistorymenu" class="rightmenu" :popup-visible="true"
                style="z-index: -1; left: -200px; opacity: 0">
      <template #content>
        <a-doption @click="handleOpenLink">
          <template #icon><i class="iconfont iconchakan" /></template>
          <template #default>查看</template>
        </a-doption>
        <a-doption @click="handleSaveMyImport">
          <template #icon><i class="iconfont iconxuanzhuan" /></template>
          <template #default>保存导入</template>
        </a-doption>
        <a-doption @click="handleCopySelectedLink">
          <template #icon><i class="iconfont iconcopy" /></template>
          <template #default>复制链接</template>
        </a-doption>
        <a-doption @click="handleBrowserLink">
          <template #icon><i class="iconfont iconchrome" /></template>
          <template #default>浏览器</template>
        </a-doption>
      </template>
    </a-dropdown>
  </div>
</template>

<style></style>
