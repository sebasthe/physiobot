import {
  FRAGMENT_SHADER,
  VERTEX_SHADER,
  UNIFORM_DEFS as GLOW_UNIFORM_DEFS,
  type GlowUniformDef,
  type GlowUniforms,
} from '../voice-glow/shader'

export type AuraUniforms = GlowUniforms
export type AuraUniformDef = GlowUniformDef

export const UNIFORM_DEFS: Record<keyof AuraUniforms, AuraUniformDef> = GLOW_UNIFORM_DEFS
export { FRAGMENT_SHADER, VERTEX_SHADER }
