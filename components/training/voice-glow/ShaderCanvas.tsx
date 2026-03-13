'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { VERTEX_SHADER, FRAGMENT_SHADER, UNIFORM_DEFS, type GlowUniforms } from './shader'

interface ShaderCanvasProps {
  uniforms: Partial<GlowUniforms>
  className?: string
  style?: CSSProperties
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  gl.deleteShader(vs)
  gl.deleteShader(fs)

  return program
}

function setUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
  type: string,
  value: number | number[],
) {
  const loc = gl.getUniformLocation(program, name)
  if (!loc) return

  if (type === '1f' && typeof value === 'number') {
    gl.uniform1f(loc, value)
  } else if (type === '2f' && Array.isArray(value)) {
    gl.uniform2f(loc, value[0], value[1])
  } else if (type === '3f' && Array.isArray(value)) {
    gl.uniform3f(loc, value[0], value[1], value[2])
  }
}

export default function ShaderCanvas({ uniforms, className, style }: ShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<{
    gl: WebGLRenderingContext
    program: WebGLProgram
  } | null>(null)
  const uniformsRef = useRef(uniforms)
  uniformsRef.current = uniforms

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    })
    if (!gl) {
      console.warn('WebGL not available, voice glow disabled')
      return
    }

    const program = createProgram(gl)
    if (!program) return

    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPosition = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(aPosition)
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    glRef.current = { gl, program }

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    let rafId = 0
    const startTime = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const tick = () => {
      const ctx = glRef.current
      if (!ctx) return

      const elapsed = (performance.now() - startTime) / 1000

      for (const [name, def] of Object.entries(UNIFORM_DEFS)) {
        const val = (uniformsRef.current as Record<string, unknown>)[name] ?? def.default
        setUniform(ctx.gl, ctx.program, name, def.type, val as number | number[])
      }

      setUniform(ctx.gl, ctx.program, 'uTime', '1f', elapsed)
      setUniform(ctx.gl, ctx.program, 'uResolution', '2f', [canvas.width, canvas.height])

      ctx.gl.clearColor(0, 0, 0, 0)
      ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT)
      ctx.gl.drawArrays(ctx.gl.TRIANGLE_STRIP, 0, 4)

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
      gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
      glRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={style}
    />
  )
}
