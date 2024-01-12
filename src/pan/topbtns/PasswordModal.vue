<script setup lang="ts">
import { computed, PropType, reactive, ref } from 'vue'
import { modalCloseAll } from '../../utils/modal'
import { usePanTreeStore, useSettingStore } from '../../store'
import { decodeName, encodeName } from '../../module/flow-enc/utils'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  optType: {
    type: String,
    required: true
  },
  callback: {
    type: Function as PropType<(success: boolean) => void>
  }
})
const settingStore = useSettingStore()
const okLoading = ref(false)
const formRef = ref()

const form = reactive({
  oldEncPassWord: '',
  encPassword: '',
  encConfirmPassword: ''
})
const modalTitle = computed(() => {
  if (props.optType === 'input') {
    return '设置安全密码'
  } else if (props.optType === 'modify') {
    return '修改安全密码'
  } else if (props.optType === 'confirm') {
    return '输入安全密码'
  } else if (props.optType === 'del') {
    return '删除安全密码'
  }
})
const userPassword = computed(() => {
  return decodeName(usePanTreeStore().user_id, useSettingStore().securityEncType, useSettingStore().securityPassword) || ''
})
const handleOpen = () => {
  setTimeout(() => {
    if (props.optType === 'input') {
      document.getElementById('encPasswordInput')?.focus()
    } else if (props.optType === 'del') {
      document.getElementById('encPasswordInput')?.focus()
    } else if (props.optType === 'modify') {
      document.getElementById('oldEncPassWordInput')?.focus()
    } else if (props.optType === 'confirm') {
      document.getElementById('encConfirmPasswordInput')?.focus()
    }
  }, 200)
  form.oldEncPassWord = ''
  form.encPassword = ''
  form.encConfirmPassword = ''
}
const handleClose = () => {
  if (okLoading.value) okLoading.value = false
  form.oldEncPassWord = ''
  form.encPassword = ''
  form.encConfirmPassword = ''
  formRef.value.resetFields()
}
const handleCancel = () => {
  modalCloseAll()
  props.callback && props.callback(false)
}

const handleOK = () => {
  formRef.value.validate((data: any) => {
    if (data) return
    okLoading.value = true
    if (props.optType === 'input' || props.optType === 'modify') {
      // 设置密码
      if (form.encPassword) {
        let encPassword = <string>encodeName(usePanTreeStore().user_id, settingStore.securityEncType, form.encPassword)
        settingStore.updateStore({ securityPassword: encPassword })
      }
    } else if (props.optType === 'del') {
      // 删除密码
      settingStore.updateStore({ securityPassword: '' })
    }
    setTimeout(() => {
      okLoading.value = false
      modalCloseAll()
      if (props.callback) {
        props.callback && props.callback(true)
      }
    }, 200)
  })
}
</script>

<template>
  <a-modal :visible='visible' modal-class='modalclass' :footer='false'
           :unmount-on-close='true' :mask-closable='false'
           @cancel='handleCancel' @close='handleClose' @before-open='handleOpen'>
    <template #title>
      <span class='modaltitle'>{{ modalTitle }}</span>
    </template>
    <a-space direction='vertical' size='large' :style="{ width: '380px'}">
      <a-form ref='formRef' auto-label-width :model='form'>
        <a-form-item v-if='optType === "modify"'
                     field='oldEncPassWord' label='旧密码'
                     :validate-trigger="['change','input']"
                     :rules="[
                        { required: true, message:'旧密码必填'},
                        { minLength: 6, message: '密码最小长度为6个字符' },
                        { validator: (value: any, cb: any) => {
                            if (value !== userPassword) {
                              cb('旧密码错误')
                            } else {
                              cb()
                            }
                          }
                        }
                     ]">
          <a-input-password
            v-model.trim='form.oldEncPassWord'
            :input-attrs="{ id: 'oldEncPassWordInput', autofocus: 'autofocus' }"
            :style="{width:'320px'}"
            placeholder="旧密码" allow-clear />
        </a-form-item>
        <a-form-item field='encPassword' label='安全密码'
                     :validate-trigger="['change','input']"
                     :rules="[
                        { required: true, message:'安全密码必填'},
                        { minLength: 6, message: '密码最小长度为6个字符' },
                        { validator: (value: any, cb: any) => {
                            if ((optType === 'modify') && value === form.oldEncPassWord) {
                              cb('安全密码和旧密码相同')
                            } else if (optType === 'del' && value !== userPassword) {
                              cb('安全密码错误')
                            } else {
                              cb()
                            }
                          }
                        }
                     ]">
          <a-input-password
            :input-attrs="{ id: 'encPasswordInput', autofocus: 'autofocus' }"
            v-model.trim='form.encPassword'
            :style="{width:'320px'}"
            placeholder="安全密码" allow-clear />
        </a-form-item>
        <a-form-item v-if='optType !== "del" && optType !== "confirm"'
                     field='encConfirmPassword' label='确认密码'
                     :validate-trigger="['change','input']"
                     :rules="[
                        { required: true, message:'确认密码必填'},
                        { minLength: 6, message: '密码最小长度为6个字符'},
                        { validator: (value: any, cb: any) => {
                            if ((optType === 'input' || optType === 'modify') && value !== form.encPassword) {
                              cb('确认密码和安全密码不一致')
                            } else if ((optType === 'del' || optType === 'confirm') && value !== userPassword) {
                              cb('安全密码错误')
                            } else {
                              cb()
                            }
                          }
                        }
                     ]">
          <a-input-password
            :input-attrs="{ id: 'encConfirmPasswordInput', autofocus: 'autofocus' }"
            v-model.trim='form.encConfirmPassword'
            :style="{width:'320px'}"
            placeholder="确认密码" allow-clear />
        </a-form-item>
      </a-form>
    </a-space>
    <div class='modalfoot'>
      <div style='flex-grow: 1'></div>
      <a-button v-if='!okLoading' type='outline' size='small' @click='handleCancel'>取消</a-button>
      <a-button type='primary' size='small' :loading='okLoading' @click='handleOK'>确认</a-button>
    </div>
  </a-modal>
</template>

<style scoped>

</style>