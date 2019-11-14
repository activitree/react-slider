import React, { Component } from 'react'
import PropTypes from 'prop-types'

function pauseEvent (e) {
  if (e.stopPropagation) e.stopPropagation()
  if (e.preventDefault) e.preventDefault()
  return false
}

function stopPropagation (e) {
  if (e.stopPropagation) e.stopPropagation()
}

/**
 * Spreads `count` values equally between `min` and `max`.
 */
function linspace (min, max, count) {
  const range = (max - min) / (count - 1)
  const res = []
  for (let i = 0; i < count; i++) {
    res.push(min + range * i)
  }
  return res
}

function ensureArray (x) {
  return x == null ? [] : Array.isArray(x) ? x : [x]
}

function undoEnsureArray (x) {
  return x != null && x.length === 1 ? x[0] : x
}

const isArray = Array.isArray || function (x) {
  return Object.prototype.toString.call(x) === '[object Array]'
}

class ReactSlider extends Component {
  static defaultProps = {
    min: 0,
    max: 100,
    step: 1,
    minDistance: 0,
    defaultValue: 0,
    orientation: 'horizontal',
    className: 'slider',
    handleClassName: 'handle',
    handleActiveClassName: 'active',
    barClassName: 'bar',
    withBars: false,
    pearling: false,
    disabled: false,
    snapDragDisabled: false,
    invert: false
  }

  _or (value, defaultValue) {
    const count = React.Children.count(this.props.children)
    switch (count) {
      case 0:
        return value.length > 0 ? value : defaultValue
      case value.length:
        return value
      case defaultValue.length:
        return defaultValue
      default:
        if (value.length !== count || defaultValue.length !== count) {
          console.warn(this.constructor.displayName + ': Number of values does not match number of children.')
        }
        return linspace(this.props.min, this.props.max, count)
    }
  }

  constructor (props) {
    super(props)
    const value = this._or(ensureArray(props.value), ensureArray(props.defaultValue))
    this.tempArray = value.slice()
    this.pendingResizeTimeouts = []
    const zIndices = []
    for (let i = 0; i < value.length; i++) {
      value[i] = this._trimAlignValue(value[i], props)
      zIndices.push(i)
    }

    this.state = {
      index: -1,
      upperBound: 0,
      sliderLength: 0,
      value: value,
      zIndices: zIndices
    }
    this._resize = this._resize.bind(this)
  }

  componentDidUpdate (prevProps, prevState, snapshot) {
    if (prevProps.value !== this.props.value) {
      const value = this._or(ensureArray(this.props.value), this.state.value)
      this.tempArray = value.slice()
      for (let i = 0; i < value.length; i++) {
        this.state.value[i] = this._trimAlignValue(value[i], this.props)
      }
      if (this.state.value.length > value.length) { this.state.value.length = value.length }
      if (this.state.upperBound === 0) {
        this._resize()
      }
    }
  }

  componentDidMount () {
    window.addEventListener('resize', this._handleResize)
    this._resize()
  }

  componentWillUnmount () {
    this._clearPendingResizeTimeouts()
    window.removeEventListener('resize', this._handleResize)
  }

  getValue () {
    return undoEnsureArray(this.state.value)
  }

  _resize () {
    const slider = this.slider
    const handle = this.handle0
    const rect = slider.getBoundingClientRect()
    const size = this._sizeKey()
    const sliderMax = rect[this._posMaxKey()]
    const sliderMin = rect[this._posMinKey()]

    this.setState({
      upperBound: slider[size] - handle[size],
      sliderLength: Math.abs(sliderMax - sliderMin),
      handleSize: handle[size],
      sliderStart: this.props.invert ? sliderMax : sliderMin
    })
  }

  _handleResize () {
    // setTimeout of 0 gives element enough time to have assumed its new size if it is being resized
    const resizeTimeout = window.setTimeout(function () {
      // drop this timeout from pendingResizeTimeouts to reduce memory usage
      this.pendingResizeTimeouts && this.pendingResizeTimeouts.shift()
      this._resize()
    }.bind(this), 0)

    this.pendingResizeTimeouts && this.pendingResizeTimeouts.push(resizeTimeout)
  }

  _clearPendingResizeTimeouts () {
    do {
      const nextTimeout = this.pendingResizeTimeouts && this.pendingResizeTimeouts.shift()

      clearTimeout(nextTimeout)
    } while (this.pendingResizeTimeouts.length)
  }

  _calcOffset (value) {
    const range = this.props.max - this.props.min
    if (range === 0) {
      return 0
    }
    const ratio = (value - this.props.min) / range
    return ratio * this.state.upperBound
  }

  _calcValue (offset) {
    const ratio = offset / this.state.upperBound
    return ratio * (this.props.max - this.props.min) + this.props.min
  }

  _buildHandleStyle (offset, i) {
    const style = {
      position: 'absolute',
      willChange: this.state.index >= 0 ? this._posMinKey() : '',
      zIndex: this.state.zIndices.indexOf(i) + 1
    }
    style[this._posMinKey()] = offset + 'px'
    return style
  }

  _buildBarStyle (min, max) {
    const obj = {
      position: 'absolute',
      willChange: this.state.index >= 0 ? this._posMinKey() + ',' + this._posMaxKey() : ''
    }
    obj[this._posMinKey()] = min
    obj[this._posMaxKey()] = max
    return obj
  }

  _getClosestIndex (pixelOffset) {
    let minDist = Number.MAX_VALUE
    let closestIndex = -1

    const value = this.state.value
    const l = value.length

    for (let i = 0; i < l; i++) {
      const offset = this._calcOffset(value[i])
      const dist = Math.abs(pixelOffset - offset)
      if (dist < minDist) {
        minDist = dist
        closestIndex = i
      }
    }
    return closestIndex
  }

  _calcOffsetFromPosition (position) {
    let pixelOffset = position - this.state.sliderStart
    if (this.props.invert) pixelOffset = this.state.sliderLength - pixelOffset
    pixelOffset -= (this.state.handleSize / 2)
    return pixelOffset
  }

  _forceValueFromPosition (position, callback) {
    const pixelOffset = this._calcOffsetFromPosition(position)
    const closestIndex = this._getClosestIndex(pixelOffset)
    const nextValue = this._trimAlignValue(this._calcValue(pixelOffset))

    const value = this.state.value.slice()
    value[closestIndex] = nextValue

    for (var i = 0; i < value.length - 1; i += 1) {
      if (value[i + 1] - value[i] < this.props.minDistance) return
    }
    this.setState({ value: value }, callback.bind(this, closestIndex))
  }

  _getMousePosition (e) {
    return [
      e['page' + this._axisKey()],
      e['page' + this._orthogonalAxisKey()]
    ]
  }

  _getTouchPosition (e) {
    var touch = e.touches[0]
    return [
      touch['page' + this._axisKey()],
      touch['page' + this._orthogonalAxisKey()]
    ]
  }

  _getKeyDownEventMap () {
    return {
      keydown: this._onKeyDown,
      focusout: this._onBlur
    }
  }

  _getMouseEventMap () {
    return {
      mousemove: this._onMouseMove.bind(this),
      mouseup: this._onMouseUp.bind(this)
    }
  }

  _getTouchEventMap () {
    return {
      touchmove: this._onTouchMove.bind(this),
      touchend: this._onTouchEnd.bind(this)
    }
  }

  _createOnKeyDown (i) {
    return function (e) {
      if (this.props.disabled) return
      this._start(i)
      this._addHandlers(this._getKeyDownEventMap())
      pauseEvent(e)
    }.bind(this)
  }

  _createOnMouseDown (i) {
    return function (e) {
      if (this.props.disabled) return
      const position = this._getMousePosition(e)
      this._start(i, position[0])
      this._addHandlers(this._getMouseEventMap())
      pauseEvent(e)
    }.bind(this)
  }

  _createOnTouchStart (i) {
    return function (e) {
      if (this.props.disabled || e.touches.length > 1) return
      const position = this._getTouchPosition(e)
      this.startPosition = position
      this.isScrolling = undefined
      this._start(i, position[0])
      this._addHandlers(this._getTouchEventMap())
      stopPropagation(e)
    }.bind(this)
  }

  _addHandlers (eventMap) {
    for (const key in eventMap) {
      document.addEventListener(key, eventMap[key], false)
    }
  }

  _removeHandlers (eventMap) {
    for (const key in eventMap) {
      document.removeEventListener(key, eventMap[key], false)
    }
  }

  _start (i, position) {
    const activeEl = document.activeElement
    const handleRef = this['handle' + i]
    if (activeEl && activeEl !== document.body && activeEl !== handleRef) {
      activeEl.blur && activeEl.blur()
    }

    this.hasMoved = false

    this._fireChangeEvent('onBeforeChange')

    const zIndices = this.state.zIndices
    zIndices.splice(zIndices.indexOf(i), 1)
    zIndices.push(i)

    this.setState(function (prevState) {
      return {
        startValue: this.state.value[i],
        startPosition: position !== undefined ? position : prevState.startPosition,
        index: i,
        zIndices: zIndices
      }
    })
  }

  _onMouseUp () {
    this._onEnd(this._getMouseEventMap())
  }

  _onTouchEnd () {
    this._onEnd(this._getTouchEventMap())
  }

  _onBlur () {
    this._onEnd(this._getKeyDownEventMap())
  }

  _onEnd (eventMap) {
    this._removeHandlers(eventMap)
    this.setState({ index: -1 }, this._fireChangeEvent.bind(this, 'onAfterChange'))
  }

  _onMouseMove (e) {
    const position = this._getMousePosition(e)
    const diffPosition = this._getDiffPosition(position[0])
    const newValue = this._getValueFromPosition(diffPosition)
    this._move(newValue)
  }

  _onTouchMove (e) {
    if (e.touches.length > 1) return

    const position = this._getTouchPosition(e)

    if (typeof this.isScrolling === 'undefined') {
      const diffMainDir = position[0] - this.startPosition[0]
      const diffScrollDir = position[1] - this.startPosition[1]
      this.isScrolling = Math.abs(diffScrollDir) > Math.abs(diffMainDir)
    }

    if (this.isScrolling) {
      this.setState({ index: -1 })
      return
    }

    pauseEvent(e)

    const diffPosition = this._getDiffPosition(position[0])
    const newValue = this._getValueFromPosition(diffPosition)

    this._move(newValue)
  }

  _onKeyDown (e) {
    if (e.ctrlKey || e.shiftKey || e.altKey) return
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        return this._moveDownOneStep()
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        return this._moveUpOneStep()
      case 'Home':
        return this._move(this.props.min)
      case 'End':
        return this._move(this.props.max)
      default:
    }
  }

  _moveUpOneStep () {
    const oldValue = this.state.value[this.state.index]
    const newValue = oldValue + this.props.step
    this._move(Math.min(newValue, this.props.max))
  }

  _moveDownOneStep () {
    const oldValue = this.state.value[this.state.index]
    const newValue = oldValue - this.props.step
    this._move(Math.max(newValue, this.props.min))
  }

  _getValueFromPosition (position) {
    const diffValue = position / (this.state.sliderLength - this.state.handleSize) * (this.props.max - this.props.min)
    return this._trimAlignValue(this.state.startValue + diffValue)
  }

  _getDiffPosition (position) {
    let diffPosition = position - this.state.startPosition
    if (this.props.invert) diffPosition *= -1
    return diffPosition
  }

  _move (newValue) {
    this.hasMoved = true
    const props = this.props
    const state = this.state
    const index = state.index
    const value = state.value
    const length = value.length
    const oldValue = value[index]
    const minDistance = props.minDistance

    // if "pearling" (= handles pushing each other) is disabled,
    // prevent the handle from getting closer than `minDistance` to the previous or next handle.
    if (!props.pearling) {
      if (index > 0) {
        const valueBefore = value[index - 1]
        if (newValue < valueBefore + minDistance) {
          newValue = valueBefore + minDistance
        }
      }

      if (index < length - 1) {
        const valueAfter = value[index + 1]
        if (newValue > valueAfter - minDistance) {
          newValue = valueAfter - minDistance
        }
      }
    }

    value[index] = newValue

    // if "pearling" is enabled, let the current handle push the pre- and succeeding handles.
    if (props.pearling && length > 1) {
      if (newValue > oldValue) {
        this._pushSucceeding(value, minDistance, index)
        this._trimSucceeding(length, value, minDistance, props.max)
      } else if (newValue < oldValue) {
        this._pushPreceding(value, minDistance, index)
        this._trimPreceding(length, value, minDistance, props.min)
      }
    }

    // Normally you would use `shouldComponentUpdate`, but since the slider is a low-level component,
    // the extra complexity might be worth the extra performance.
    if (newValue !== oldValue) {
      this.setState({ value: value }, this._fireChangeEvent.bind(this, 'onChange'))
    }
  }

  _pushSucceeding (value, minDistance, index) {
    let i, padding
    for (i = index, padding = value[i] + minDistance;
      value[i + 1] != null && padding > value[i + 1];
      i++, padding = value[i] + minDistance) {
      value[i + 1] = this._alignValue(padding)
    }
  }

  _trimSucceeding (length, nextValue, minDistance, max) {
    for (let i = 0; i < length; i++) {
      const padding = max - i * minDistance
      if (nextValue[length - 1 - i] > padding) {
        nextValue[length - 1 - i] = padding
      }
    }
  }

  _pushPreceding (value, minDistance, index) {
    let i, padding
    for (i = index, padding = value[i] - minDistance;
      value[i - 1] != null && padding < value[i - 1];
      i--, padding = value[i] - minDistance) {
      value[i - 1] = this._alignValue(padding)
    }
  }

  _trimPreceding (length, nextValue, minDistance, min) {
    for (let i = 0; i < length; i++) {
      const padding = min + i * minDistance
      if (nextValue[i] < padding) {
        nextValue[i] = padding
      }
    }
  }

  _axisKey () {
    const orientation = this.props.orientation
    if (orientation === 'horizontal') return 'X'
    if (orientation === 'vertical') return 'Y'
  }

  _orthogonalAxisKey () {
    const orientation = this.props.orientation
    if (orientation === 'horizontal') return 'Y'
    if (orientation === 'vertical') return 'X'
  }

  _posMinKey () {
    const orientation = this.props.orientation
    if (orientation === 'horizontal') return this.props.invert ? 'right' : 'left'
    if (orientation === 'vertical') return this.props.invert ? 'bottom' : 'top'
  }

  _posMaxKey () {
    const orientation = this.props.orientation
    if (orientation === 'horizontal') return this.props.invert ? 'left' : 'right'
    if (orientation === 'vertical') return this.props.invert ? 'top' : 'bottom'
  }

  _sizeKey () {
    const orientation = this.props.orientation
    if (orientation === 'horizontal') return 'clientWidth'
    if (orientation === 'vertical') return 'clientHeight'
  }

  _trimAlignValue (val, props) {
    return this._alignValue(this._trimValue(val, props), props)
  }

  _trimValue (val, props) {
    props = props || this.props
    if (val <= props.min) val = props.min
    if (val >= props.max) val = props.max
    return val
  }

  _alignValue (val, props) {
    props = props || this.props

    const valModStep = (val - props.min) % props.step
    let alignValue = val - valModStep

    if (Math.abs(valModStep) * 2 >= props.step) {
      alignValue += (valModStep > 0) ? props.step : (-props.step)
    }

    return parseFloat(alignValue.toFixed(5))
  }

  _renderHandle (style, child, i) {
    const self = this
    const className = this.props.handleClassName + ' ' +
      (this.props.handleClassName + '-' + i) + ' ' +
      (this.state.index === i ? this.props.handleActiveClassName : '')

    return (
      React.createElement('div', {
        ref: r => {
          self['handle' + i] = r
        },
        key: 'handle' + i,
        className: className,
        style: style,
        onMouseDown: this._createOnMouseDown(i),
        onTouchStart: this._createOnTouchStart(i),
        onFocus: this._createOnKeyDown(i),
        tabIndex: 0,
        role: 'slider',
        'aria-valuenow': this.state.value[i],
        'aria-valuemin': this.props.min,
        'aria-valuemax': this.props.max,
        'aria-label': isArray(this.props.ariaLabel) ? this.props.ariaLabel[i] : this.props.ariaLabel,
        'aria-valuetext': this.props.ariaValuetext
      },
      child
      )
    )
  }

  _renderHandles (offset) {
    const length = offset.length

    const styles = this.tempArray
    for (let i = 0; i < length; i++) {
      styles[i] = this._buildHandleStyle(offset[i], i)
    }

    const res = []
    const renderHandle = this._renderHandle.bind(this)
    if (React.Children.count(this.props.children) > 0) {
      React.Children.forEach(this.props.children, function (child, i) {
        res[i] = renderHandle(styles[i], child, i)
      })
    } else {
      for (let i = 0; i < length; i++) {
        res[i] = renderHandle(styles[i], null, i)
      }
    }
    return res
  }

  _renderBar (i, offsetFrom, offsetTo) {
    const self = this
    return (
      React.createElement('div', {
        key: 'bar' + i,
        ref: function (r) {
          self['bar' + i] = r
        },
        className: this.props.barClassName + ' ' + this.props.barClassName + '-' + i,
        style: this._buildBarStyle(offsetFrom, this.state.upperBound - offsetTo)
      })
    )
  }

  _renderBars (offset) {
    const bars = []
    const lastIndex = offset.length - 1

    bars.push(this._renderBar(0, 0, offset[0]))

    for (let i = 0; i < lastIndex; i++) {
      bars.push(this._renderBar(i + 1, offset[i], offset[i + 1]))
    }

    bars.push(this._renderBar(lastIndex + 1, offset[lastIndex], this.state.upperBound))

    return bars
  }

  _onSliderMouseDown (e) {
    if (this.props.disabled) return
    this.hasMoved = false
    if (!this.props.snapDragDisabled) {
      const position = this._getMousePosition(e)
      this._forceValueFromPosition(position[0], function (i) {
        this._start(i, position[0])
        this._fireChangeEvent('onChange')
        this._addHandlers(this._getMouseEventMap())
      }.bind(this))
    }

    pauseEvent(e)
  }

  _onSliderClick (e) {
    if (this.props.disabled) return

    if (this.props.onSliderClick && !this.hasMoved) {
      const position = this._getMousePosition(e)
      const valueAtPos = this._trimAlignValue(this._calcValue(this._calcOffsetFromPosition(position[0])))
      this.props.onSliderClick(valueAtPos)
    }
  }

  _fireChangeEvent (event) {
    if (this.props[event]) {
      this.props[event](undoEnsureArray(this.state.value))
    }
  }

  render () {
    const self = this
    const state = this.state
    const props = this.props

    const offset = this.tempArray
    const value = state.value
    const l = value.length
    for (let i = 0; i < l; i++) {
      offset[i] = this._calcOffset(value[i], i)
    }

    const bars = props.withBars ? this._renderBars(offset) : null
    const handles = this._renderHandles(offset)

    return (
      React.createElement('div', {
        ref: r => { self.slider = r },
        style: { position: 'relative' },
        className: props.className + (props.disabled ? ' disabled' : ''),
        onMouseDown: this._onSliderMouseDown.bind(this),
        onClick: this._onSliderClick.bind(this)
      },
      bars,
      handles
      )
    )
  }
}

export default ReactSlider

ReactSlider.propTypes = {
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  minDistance: PropTypes.number,
  defaultValue: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.arrayOf(PropTypes.number)
  ]),
  value: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.arrayOf(PropTypes.number)
  ]),
  orientation: PropTypes.oneOf(['horizontal', 'vertical']),
  className: PropTypes.string,
  handleClassName: PropTypes.string,
  handleActiveClassName: PropTypes.string,
  withBars: PropTypes.bool,
  barClassName: PropTypes.string,
  pearling: PropTypes.bool,
  disabled: PropTypes.bool,
  snapDragDisabled: PropTypes.bool,
  invert: PropTypes.bool,
  onBeforeChange: PropTypes.func,
  onChange: PropTypes.func,
  onAfterChange: PropTypes.func,
  onSliderClick: PropTypes.func
}
