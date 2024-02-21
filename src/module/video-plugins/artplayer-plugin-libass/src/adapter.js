import JASSUB from 'jassub'
import JASSUBWorker from 'jassub/dist/jassub-worker.js?url'
import JASSUBWorkerWasm from 'jassub/dist/jassub-worker.wasm?url'

const defaultAssSubtitle = `[Script Info]\nScriptType: v4.00+`

export default class LibassAdapter {
  constructor(art, option) {
    const { constructor, template } = art

    this.art = art
    this.$video = template.$video
    this.$webvtt = template.$subtitle
    this.utils = constructor.utils

    this.libass = null

    art.once('ready', this.init.bind(this, option))
  }

  async init(option) {
    this.#checkWebAssemblySupport()

    await this.#createLibass(option)

    this.#addEventListeners()

    this.art.emit('artplayerPluginLibass:init', this)

    // set initial subtitle
    const initialSubtitle = this.art?.option?.subtitle?.url
    if (initialSubtitle && this.utils.getExt(initialSubtitle) === 'ass') {
      this.switch(initialSubtitle)
    }
  }

  switch(url) {
    this.art.emit('artplayerPluginLibass:switch', url)
    if (url && this.utils.getExt(url) === 'ass') {
      this.currentType = 'ass'
      this.libass.freeTrack()
      this.libass.setTrackByUrl(this.#toAbsoluteUrl(url))
      this.visible = this.art.subtitle.show
    } else {
      this.currentType = 'webvtt'
      this.hide()
      this.libass.freeTrack()
    }
  }

  setVisibility(visible) {
    this.visible = visible
  }

  setOffset(offset) {
    this.timeOffset = offset
  }

  get active() {
    return this.currentType === 'ass'
  }

  get visible() {
    if (!this.libass)
      return false

    return this.libass.canvas.style.display !== 'none'
  }

  set visible(visible) {
    this.art.emit('artplayerPluginLibass:visible', visible)

    this.#setVttVisible(!this.active)

    if (this.libass.canvas) {
      this.libass.canvas.style.display = visible ? 'block' : 'none'
      if (visible) this.libass.resize()
    }
  }

  get timeOffset() {
    return this.libass.timeOffset
  }

  set timeOffset(offset) {
    this.art.emit('artplayerPluginLibass:timeOffset', offset)
    this.libass.timeOffset = offset
  }

  show() {
    this.visible = true
  }

  hide() {
    this.visible = false
  }

  destroy() {
    this.art.emit('artplayerPluginLibass:destroy')

    this.#removeEventListeners()

    this.libass.destroy()
    this.libass = null
  }

  async #createLibass(option = {}) {
    if (!option.workerUrl) {
      option.workerUrl = JASSUBWorker
    }
    if (!option.wasmUrl) {
      option.wasmUrl = JASSUBWorkerWasm
    }
    if (option.availableFonts) {
      option.availableFonts = Object
        .entries(option.availableFonts)
        .reduce((acc, [key, value]) => {
          acc[key] = this.#toAbsoluteUrl(value)
          return acc
        }, {})
    }
    this.libass = new JASSUB({
      subContent: defaultAssSubtitle,
      video: this.$video,
      ...option,
      fonts: option.fonts?.map((font) => this.#toAbsoluteUrl(font))
    })
  }

  #addEventListeners() {
    this.switchHandler = this.switch.bind(this)
    this.visibleHandler = this.setVisibility.bind(this)
    this.offsetHandler = this.setOffset.bind(this)

    this.art.on('subtitle', this.visibleHandler)
    this.art.on('subtitleLoad', this.switchHandler)
    this.art.on('subtitleOffset', this.offsetHandler)

    this.art.once('destroy', this.destroy.bind(this))
  }

  #removeEventListeners() {
    this.art.off('subtitle', this.visibleHandler)
    this.art.off('subtitleLoad', this.switchHandler)
    this.art.off('subtitleOffset', this.offsetHandler)
  }

  #setVttVisible(visible) {
    this.$webvtt.style.visibility = visible ? 'visible' : 'hidden'
  }

  #toAbsoluteUrl(url) {
    if (this.#isAbsoluteUrl(url))
      return url
    // handle absolute URL when the `Worker` of `BLOB` type loading network resources
    return new URL(url, document.baseURI).toString()
  }

  #isAbsoluteUrl(url) {
    return /^https?:\/\//.test(url)
  }

  #checkWebAssemblySupport() {
    let supportsWebAssembly = false
    try {
      if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
        const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
        if (module instanceof WebAssembly.Module)
          supportsWebAssembly = (new WebAssembly.Instance(module) instanceof WebAssembly.Instance)
      }
    } catch (e) {
      //
    }

    this.utils.errorHandle(supportsWebAssembly, 'Browser does not support WebAssembly')
  }
}
