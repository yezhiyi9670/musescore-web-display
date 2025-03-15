(() => {

  //==============================================

  function useFrameEffect(func) {
    return Vue.watchEffect((cleanup) => {
      let sustain = true
      function adjust() {
        func()
        if(sustain) {
          requestAnimationFrame(adjust)
        }
      }
      requestAnimationFrame(adjust)
      cleanup(() => {
        sustain = false
      })
    })
  }

  //==============================================

  const Page = {
    emits: ['select'],
    props: {
      id: Number,
      page: [ null, Boolean, String ],
      pageFormat: Object,
      highlighterElid: [ null, String ],
      elementsDict: Object,
    },
    setup(props, ctx) {
      const pageFormat = props.pageFormat
      const ref = Vue.ref(null)

      useFrameEffect(() => {
        if(!ref.value) return
        const newWidth = (ref.value.clientHeight - 2) * pageFormat.width / pageFormat.height + 'px'
        if(ref.value.style.width != newWidth) {
          ref.value.style.width = newWidth
          ref.value.style.fontSize = newWidth
        }
      })
      
      const svgParsed = Vue.computed(() => {
        if(typeof props.page != 'string') {
          return null
        }
        const vdoc = new DOMParser().parseFromString(props.page, 'image/svg+xml')
        vdoc.querySelector('svg>title').remove()
        const backgroundElement = vdoc.querySelector(
          'desc+path[fill="#ffffff"]'
        )
        if(backgroundElement) {
          backgroundElement.remove()
        }
        const svg = vdoc.querySelector('svg')
        return [
          svg.getAttribute('viewBox'),
          svg.innerHTML
        ]
      })

      const highlighterElement = Vue.computed(() => {
        if(props.highlighterElid in props.elementsDict) {
          const element = props.elementsDict[props.highlighterElid]
          if(element.page == props.id) {
            return element
          }
        }
        return null
      })
      const clickableElements = Vue.computed(() => {
        const ret = []
        for(let id in props.elementsDict) {
          let element = props.elementsDict[id]
          if(!('page' in element)) continue
          if(element.page == props.id) {
            ret.push(element)
          }
        }
        return ret
      })

      function selectElement(elid) {
        ctx.emit('select', elid)
      }

      return { ref, svgParsed, highlighterElement, clickableElements, selectElement }
    },
    template: /*html*/`
      <div class="slcwd-page" ref="ref">
        <div v-if="typeof page != 'string'" class="slcwd-page-placeholder">
          <div class="slcwd-page-placeholder-i">{{ id + 1 }}</div>
        </div>
        <svg v-else class="slcwd-page-graphic" :viewBox="svgParsed[0]">
          <rect v-if="highlighterElement"
            :x="highlighterElement.pos[0]"
            :y="highlighterElement.pos[1]"
            :width="highlighterElement.size[0]"
            :height="highlighterElement.size[1]"
            fill="#d7e7ff"
          />
          <g v-html="svgParsed[1]" />
          <rect v-for="element in clickableElements"
            :x="element.pos[0]"
            :y="element.pos[1]"
            :width="element.size[0]"
            :height="element.size[1]"
            fill="transparent"
            :style="{cursor: 'pointer'}"
            @click="() => selectElement(element.elid)"
          />
        </svg>
      </div>
    `
  }

  //==============================================

  /**
   * Displays multiple pages.
   * 
   * Spec:
   * - The `pages` is an Array made of either `null` (unloaded), `false` (loading) or string (loaded).
   * - The `mposText` is the XML text file defining the positions of measures.
   * - The `current` is the current playback time, in seconds.
   * - `@select` emits with all the matching timestamps in seconds when the user clicks on a measure.
   */
  const PagesDisplay = {
    emits: ['select'],
    props: {
      loaded: Boolean,
      errored: Boolean,
      pages: [ null, Array ],
      pageFormat: [ null, Object ],
      mposText: [ null, String ],
      audioTime: [ null, Number ],
      refPagesApi: [ null, Object ]
    },
    setup(props, ctx) {
      if(props.refPagesApi) props.refPagesApi.value = { toggleAutoScroll, toggleZoomed }

      const ref = Vue.ref(null)
      const zoomed = Vue.ref(false)
      function toggleZoomed() {
        zoomed.value = !zoomed.value
      }
      const innerRef = Vue.ref(null)

      useFrameEffect(function() {
        if(!ref.value) return
        let newHeight = 0
        if(zoomed.value) {
          newHeight = Math.min(1350, ref.value.offsetWidth * 1.45)
        } else {
          newHeight = Math.min(1200, window.innerHeight - 160, ref.value.offsetWidth * 1.3)
        }
        newHeight = newHeight + 'px'
        if(ref.value.style.height != newHeight) {
          ref.value.style.height = newHeight
        }
      })

      const mposXml = Vue.computed(() => {
        const vdoc = new DOMParser().parseFromString(props.mposText ?? '<none />', 'application/xml')
        return vdoc
      })
      const events = Vue.computed(() => {
        const items = mposXml.value.querySelectorAll('event')
        const ret = []
        for(let i = 0; i < items.length; i++) {
          const item = items[i]
          ret.push({
            elid: item.getAttribute('elid'),
            time: item.getAttribute('position') / 1000
          })
        }
        return ret
      })
      const elements = Vue.computed(() => {
        const posScale = 12
        const items = mposXml.value.querySelectorAll('element')
        const ret = {}
        for(let i = 0; i < items.length; i++) {
          const item = items[i]
          const element = {
            elid: item.getAttribute('id'),
            pos: [item.getAttribute('x') / posScale, item.getAttribute('y') / posScale],
            size: [item.getAttribute('sx') / posScale, item.getAttribute('sy') / posScale],
            page: +item.getAttribute('page')
          }
          const minWidth = 64
          if(element.size[0] < minWidth) {
            // element.pos[0] -= (minWidth - element.size[0]) / 2
            element.size[0] = minWidth
          }
          ret[item.getAttribute('id')] = element
        }
        return ret
      })
      const highlighterIndex = { current: 0 }
      const highlighterElid = Vue.computed(() => {
        const eventList = events.value
        if(props.audioTime == null || eventList.length == 0) {
          return null
        }
        let i = highlighterIndex.current
        if(i < 0 || i >= eventList.length) {
          i = 0
        }
        // Back
        while(i >= 0 && props.audioTime < eventList[i].time) {
          i -= 1
        }
        // Forward
        while(i < eventList.length - 1 && props.audioTime >= eventList[i + 1].time) {
          i += 1
        }
        // Tell
        highlighterIndex.current = i
        if(i < 0) {
          return null
        }
        return eventList[i].elid
      })
      // Auto scroll
      const enableAutoScroll = Vue.ref(true)
      function toggleAutoScroll() {
        enableAutoScroll.value = !enableAutoScroll.value
      }
      Vue.watchEffect(() => {
        if(!enableAutoScroll.value) return
        if(!innerRef.value) return
        if(highlighterElid.value == null) return
        const element = elements.value[highlighterElid.value]
        if(!element) return
        const parent = innerRef.value
        const page = parent.children[element.page]
        if(!page) return

        const viewportWidth = parent.clientWidth
        const pageWidth = page.offsetWidth
        const currentLeft = page.offsetLeft - parent.scrollLeft
        const currentRight = page.offsetLeft + pageWidth - parent.scrollLeft

        const isWithinRange = pageWidth <= viewportWidth ? (
          currentLeft >= 0 && currentRight <= viewportWidth  // requiring the whole page in the viewport
        ) : (
          currentLeft <= viewportWidth && currentRight >= 0  // requiring only some part in the viewport
        )
        if(isWithinRange) return
        const targetLeft = Math.max(
          page.offsetLeft - pageWidth * 0.20,                  // Page to the left with a padding
          page.offsetLeft + pageWidth / 2 - viewportWidth / 2  // Page to the center
        )
        
        parent.scrollTo({
          left: targetLeft,
          behavior: 'smooth'
        })
      })

      function selectElement(elid) {
        const ret = []
        for(let event of events.value) {
          if(event.elid == elid) {
            ret.push(event.time)
          }
        }
        ctx.emit('select', ret)
      }

      return { ref, innerRef, enableAutoScroll, zoomed, highlighterElid, elements, selectElement, toggleAutoScroll, toggleZoomed }
    },
    components: {
      Page
    },
    template: /*html*/`
      <div class="slcwd-pages-display" ref="ref">
        <div class="slcwd-pages-display-error" v-if="errored">
          <div style="font-size: 64px; opacity: 0.37;"><i class="las la-exclamation-circle"></i></div>
          <p>Failed to load the score.</p>
          <p>Reload the page to try again.</p>
        </div>
        <div class="slcwd-pages-display-empty" v-if="!loaded && !errored"></div>
        <div class="slcwd-pages-display-i" ref="innerRef" v-if="loaded">
          <Page
            v-for="page, id in pages"
            :id="id"
            :page="page"
            :pageFormat="pageFormat"
            :highlighterElid="highlighterElid"
            :elementsDict="elements"
            @select="elid => selectElement(elid)"
          />
        </div>
      </div>
      <div class="slcwd-pages-controls slcwd-button-group">
        <button
          @click="toggleAutoScroll"
          :selected="enableAutoScroll ? '' : null"
          class="slcwd-button"
        >
          <i class="las la-arrows-alt-h"></i> <span class="label">Auto-<span style="text-decoration:underline">s</span>croll</span>
        </button>
        <button
          @click="toggleZoomed"
          :selected="zoomed ? '' : null"
          class="slcwd-button"
        >
          <i class="las la-search-plus"></i> <span class="label"><span style="text-decoration:underline">Z</span>oom</span>
        </button>
      </div>
    `
  }

  //==============================================

  const ScorePlayback = {
    props: {
      src: String,
      refAudioApi: [ null, Object ],
      altSrc: [ null, String ],
    },
    emits: ['timeChange'],
    setup(props, ctx) {
      if(props.refAudioApi) props.refAudioApi.value = {
        setCurrentTime: setProgress,
        getCurrentTime: getProgress,
        playPause,
        addProgress,
        toggleAltTrack
      }

      const currentSrcMain = Vue.ref('')
      const loadedMain = Vue.ref(false)
      const audioMain = Vue.ref(null)

      const currentSrcAlt = Vue.ref('')
      const loadedAlt = Vue.ref(false)
      const audioAlt = Vue.ref(null)
      
      const progressbar = Vue.ref(null)
      const isPlaying = Vue.ref(false)
      const progressRatio = Vue.ref(0)
      const loadedRatio = Vue.ref(0)

      const altActive = Vue.ref(false)
      const audio = Vue.computed(() => {
        return altActive.value ? audioAlt.value : audioMain.value
      })
      const audioTheOther = Vue.computed(() => {
        return altActive.value ? audioMain.value : audioAlt.value
      })
      const loaded = Vue.computed(() => {
        return altActive.value ? loadedAlt.value : loadedMain.value
      })
      function toggleAltTrack() {
        if(props.altSrc == null) return
        if(!audio.value || !audioAlt.value) return

        audioTheOther.value.currentTime = audio.value.currentTime
        if(!audio.value.paused) {
          audio.value.pause()
          audioTheOther.value.play()
        }
        altActive.value = !altActive.value
      }

      function checkAudioLoad(srcProp, currentSrc, audio, loaded) {
        if(currentSrc.value == srcProp) {
          return
        }
        if(audio.value) {
          currentSrc.value = srcProp
          loaded.value = false
          audio.value.src = currentSrc.value
          audio.value.load()
        }
      }
      Vue.watchPostEffect(() => {
        checkAudioLoad(props.src, currentSrcMain, audioMain, loadedMain)
        if(props.altSrc != null) {
          checkAudioLoad(props.altSrc, currentSrcAlt, audioAlt, loadedAlt)
        }
      })

      function reportCurrent() {
        if(!audio.value) {
          ctx.emit('timeChange', null)
        }
        if(!audio.value.paused) {
          // Keep persistent reporting while playing
          ctx.emit('timeChange', audio.value.currentTime ?? null)
        }
      }

      useFrameEffect(() => {
        reportCurrent()

        if(!audio.value) return
        if(!loaded.value) return  // Only update state when loaded
        isPlaying.value = !audio.value.paused

        const bufferRanges = audio.value.buffered
        const currentTime = audio.value.currentTime
        const duration = audio.value.duration
        const ratio = currentTime / duration
        if(ratio == ratio) {
          progressRatio.value = ratio
        }
        let bufferedTime = 0
        for(let i = 0; i < bufferRanges.length; i++) {
          if(bufferRanges.start(i) <= currentTime && bufferRanges.end(i) >= currentTime) {
            bufferedTime = bufferRanges.end(i)
            break
          }
        }
        const bRatio = bufferedTime / duration
        if(bRatio == bRatio) {
          loadedRatio.value = bRatio
        }
      })

      function playPause() {
        if(!audio.value || !loaded.value) return
        if(audio.value.paused) {
          audio.value.play()
        } else {
          audio.value.pause()
        }
      }
      function stop() {
        if(!audio.value) return
        audio.value.pause()
        audio.value.currentTime = 0
        ctx.emit('timeChange', null)
      }
      function setProgress(time) {
        if(!audio.value) return
        if(time > audio.value.duration) time = audio.value.duration
        if(time < 0) time = 0
        audio.value.currentTime = time
        ctx.emit('timeChange', time)
      }
      function getProgress() {
        if(!audio.value) return -1
        return audio.value.currentTime
      }
      function addProgress(time) {
        if(!audio.value) return
        let newTime = time + audio.value.currentTime
        setProgress(newTime)
      }
      function tweakProgressOnBar(event) {
        event.preventDefault()
        if(!audio.value) return
        if(!progressbar.value) return
        const mouseX = event.clientX
        const rect = progressbar.value.getBoundingClientRect()
        const ratio = (mouseX - rect.left) / (rect.right - rect.left)
        const currentTime = ratio * audio.value.duration
        if(currentTime == currentTime) {
          setProgress(currentTime)
        }
      }
      function progressMouseDown(event) {
        if(!audio.value) {
          return
        }
        tweakProgressOnBar(event)
        const wasPlaying = !audio.value.paused
        if(wasPlaying) {
          audio.value.pause()
        }
        document.addEventListener('mousemove', tweakProgressOnBar)
        function cleanup() {
          document.removeEventListener('mousemove', tweakProgressOnBar)
          document.removeEventListener('mouseup', cleanup)
          if(wasPlaying && !audio.value.ended) {
            audio.value.play()
          }
        }
        document.addEventListener('mouseup', cleanup)
      }

      return {
        loaded, loadedMain, loadedAlt, audioMain, audioAlt, progressbar, playPause, stop, isPlaying,
        progressRatio, loadedRatio, addProgress, progressMouseDown,
        altActive, toggleAltTrack
      }
    },
    template: /*html*/`
      <div class="slcwd-playback-controls">
        <button
          @click="playPause"
          :disabled="!loaded"
          class="slcwd-button slcwd-playback-button slcwd-pause"
        >
          <i :class="['las', isPlaying ? 'la-pause' : 'la-play']"></i>
        </button>
        <button
          @wheel.prevent="addProgress($event.wheelDelta / 120)"
          @click="stop"
          :disabled="!loaded"
          class="slcwd-button slcwd-playback-button slcwd-stop"
        >
          <i class="las la-stop"></i>
        </button>
        <button
          v-if="altSrc != null"
          @click="toggleAltTrack"
          class="slcwd-button slcwd-playback-button slcwd-alt-track"
        >
          <i :class="['las', altActive ?  'la-microphone-alt' : 'la-headphones']"></i>
        </button>
        <div class="slcwd-playback-progress">
          <div
            ref="progressbar"
            class="slcwd-playback-progressbar"
            @mousedown.prevent="progressMouseDown"
          >
            <div class="slcwd-playback-progressbar-l" :style="{
              width: loadedRatio * 100 + '%'
            }"></div>
            <div class="slcwd-playback-progressbar-i" :style="{
              width: progressRatio * 100 + '%'
            }"></div>
          </div>
        </div>
      </div>
      <audio @canplay="loadedMain = true" ref="audioMain" preload="metadata" />
      <audio @canplay="loadedAlt = true" ref="audioAlt" preload="metadata" />
    `
  }

  //==============================================

  /**
   * The interactive score display.
   * 
   * Spec:
   * - The `src` should point to a directory, with or without a trailing slash.
   * - The directory should include:
   *   - `meta.metajson`, the score metadata.
   *   - `graphic-%d.svg`, the SVG of all pages.
   *   - Optionally `audio.ogg`, the reference audio. Set `canPlay` to `true` in order to play audio.
   *   - Optionally `audio-alt.ogg`, the no-vocal audio. Set `hasAltTrack` to `true` in order to enable it.
   *   - Optionally `measures.mpos`, the measure position references.
   */
  const ScoreDisplay = {
    props: {
      src: {type: String, required: true},
      canPlay: {type: Boolean, required: false},
      hasAltTrack: {type: Boolean, required: false},
      versionCode: {type: String, required: false},
    },
    setup(props) {
      const versionCode = Vue.computed(() => {
        return props.versionCode ?? ''
      })

      const currentSrc = Vue.ref('')
      const loadToken = Vue.ref(null)

      const scoreMeta = Vue.ref(null)
      const loaded = Vue.computed(() => {
        return scoreMeta.value != null
      })
      const errored = Vue.ref(false)
      const graphics = Vue.ref(null)

      const mposText = Vue.ref(null)

      const audioSrc = Vue.computed(() => {
        return currentSrc.value + '/audio.ogg?v=' + versionCode.value
      })
      const altAudioSrc = Vue.computed(() => {
        if(!props.hasAltTrack) {
          return null
        }
        return currentSrc.value + '/audio-alt.ogg?v=' + versionCode.value
      })
      const audioTime = Vue.ref(null)  // current audio time
      const refAudioApi = Vue.reactive({ value: null })
      function selectTimes(times) {
        if(!refAudioApi.value || times.length == 0) {
          return
        }
        let bestTime = -1, bestDiff = Infinity
        // Pick the best matching timestamp
        for(const time of times) {
          let diff = time - refAudioApi.value.getCurrentTime()
          if(diff < 0) {
            diff = -diff * 1
          }
          if(diff < bestDiff) {
            bestDiff = diff
            bestTime = time
          }
        }
        refAudioApi.value.setCurrentTime(bestTime)
      }
      function playPause() {
        refAudioApi.value && refAudioApi.value.playPause()
      }
      function addProgress(val) {
        refAudioApi.value && refAudioApi.value.addProgress(val)
      }
      
      const refPagesApi = Vue.reactive({ value: null })
      function handleExactKey(event) {
        if(event.key.toLowerCase() == 's') {
          event.preventDefault()
          refPagesApi.value && refPagesApi.value.toggleAutoScroll()
        }
        if(event.key.toLowerCase() == 'z') {
          event.preventDefault()
          refPagesApi.value && refPagesApi.value.toggleZoomed()
        }
        if(event.key.toLowerCase() == 'a') {
          event.preventDefault()
          refAudioApi.value && refAudioApi.value.toggleAltTrack()
        }
      }

      // Load metadata and mpos
      Vue.watchEffect(() => {
        if(currentSrc.value == props.src) {
          return
        }
        currentSrc.value = props.src
        
        // Clear state
        scoreMeta.value = null
        loadToken.value = Math.random()
        graphics.value = null
        mposText.value = null
        errored.value = false
        
        // Initiate metadata load
        ;(async (token) => {
          const response = await fetch(currentSrc.value + '/meta.metajson?v=' + versionCode.value)
          try {
            const meta = await response.json()
            if(token == loadToken.value) {
              if(!('pages' in meta) && ('metadata' in meta)) {
                scoreMeta.value = meta.metadata
              } else {
                scoreMeta.value = meta
              }

              // Load pages
              graphics.value = Array(scoreMeta.value.pages).fill(null)
            }
          } catch(_err) {
            console.warn('meta.metajson load failed.', _err)
            errored.value = true
          }
        })(loadToken.value)

        // Initiate mpos load
        ;(async (token) => {
          const response = await fetch(currentSrc.value + '/measures.mpos?v=' + versionCode.value)
          try {
            const mpos = await response.text()
            if(token == loadToken.value) {
              mposText.value = mpos
            }
          } catch(_err) {
            console.warn('measures.mpos load failed.', _err)
          }
        })(loadToken.value)
      })

      // Try to load graphic
      function tryLoadGraphic(pageId) {
        if(graphics.value[pageId] != null) {
          return
        }
        ;(async (token) => {
          graphics.value[pageId] = false
          const url = currentSrc.value + '/graphic-' + (pageId + 1) + '.svg?v=' + versionCode.value
          const response = await fetch(url)
          try {
            const text = await response.text()
            if(token != loadToken.value) {
              return
            }
            graphics.value[pageId] = text
          } catch(_err) {
            console.warn('Graphic load failed.', _err)
            setTimeout(() => {
              if(token != loadToken.value) {
                return
              }
              graphics.value[pageId] = null
            }, 1000)
          }
        })(loadToken.value)
      }

      // Check for graphics to load
      Vue.watchEffect(() => {
        if(!loaded.value) {
          return
        }
        let loadingCount = 0
        for(let item in graphics.value) {
          if(item == false) {
            loadingCount += 1
          }
        }
        for(let i = 0; i < graphics.value.length; i++) {
          if(loadingCount >= 3) {
            break
          }
          if(graphics.value[i] == null) {
            loadingCount += 1
            tryLoadGraphic(i)
          }
        }
      })

      return {
        scoreMeta, loaded, errored, graphics, mposText, audioSrc, audioTime,
        refAudioApi, selectTimes, playPause, addProgress, refPagesApi, handleExactKey, altAudioSrc
      }
    },
    components: { PagesDisplay, ScorePlayback },
    template: /*html*/`
      <div
        tabindex="0"
        class="slcwd-score-display"
        @keydown.space.exact.prevent="playPause"
        @keydown.left.exact.prevent="() => addProgress(-2)"
        @keydown.right.exact.prevent="() => addProgress(+2)"
        @keydown.exact="handleExactKey"
      >
        <PagesDisplay
          :loaded="loaded" :errored="errored"
          :pages="graphics"
          :pageFormat="scoreMeta ? scoreMeta.pageFormat : null"
          :mposText="mposText"
          :audioTime="audioTime"
          @select="times => selectTimes(times)"
          :refPagesApi="refPagesApi"
        />
        <ScorePlayback
          v-if="canPlay"
          :altSrc="altAudioSrc"
          :src="audioSrc"
          @timeChange="val => audioTime = val"
          :refAudioApi="refAudioApi"
        />
      </div>
    `
  }

  Object.assign(window, { ScoreDisplay })

})()
