package com.mvmsolo.motionbrowser

enum class MotionDirection { UP, DOWN, LEFT, RIGHT }
enum class MotionSensitivity { LOW, MEDIUM, HIGH }

private data class GestureConfig(
    val activationDeg: Float,
    val resetDeg: Float,
    val holdMs: Long,
    val cooldownMs: Long,
    val smoothing: Float,
    val dominance: Float
)

private enum class RecognizerMode { NEUTRAL, CANDIDATE, LATCHED }

/** One gesture per deliberate tilt; samples stay in memory on the device. */
class MotionGestureRecognizer {
    private var mode = RecognizerMode.NEUTRAL
    private var smoothPitch = 0f
    private var smoothRoll = 0f
    private var primed = false
    private var candidate: MotionDirection? = null
    private var candidateSince: Long? = null
    private var lastEmitAt: Long? = null

    fun reset() {
        mode = RecognizerMode.NEUTRAL
        smoothPitch = 0f
        smoothRoll = 0f
        primed = false
        candidate = null
        candidateSince = null
        lastEmitAt = null
    }

    fun feed(
        pitch: Float,
        roll: Float,
        timestampMs: Long,
        sensitivity: MotionSensitivity = MotionSensitivity.MEDIUM
    ): MotionDirection? {
        val config = configFor(sensitivity)
        if (!primed) {
            smoothPitch = pitch
            smoothRoll = roll
            primed = true
        } else {
            smoothPitch += (pitch - smoothPitch) * config.smoothing
            smoothRoll += (roll - smoothRoll) * config.smoothing
        }

        val direction = dominant(smoothPitch, smoothRoll, config)
        if (mode == RecognizerMode.LATCHED) {
            if (isNeutral(smoothPitch, smoothRoll, config.resetDeg)) {
                mode = RecognizerMode.NEUTRAL
                candidate = null
                candidateSince = null
            }
            return null
        }
        if (direction == null) {
            mode = RecognizerMode.NEUTRAL
            candidate = null
            candidateSince = null
            return null
        }

        val last = lastEmitAt
        if (last != null && timestampMs - last < config.cooldownMs) {
            mode = RecognizerMode.NEUTRAL
            candidate = null
            candidateSince = null
            return null
        }
        if (candidate != direction) {
            mode = RecognizerMode.CANDIDATE
            candidate = direction
            candidateSince = timestampMs
            return null
        }
        val started = candidateSince
        if (started != null && timestampMs - started >= config.holdMs) {
            mode = RecognizerMode.LATCHED
            lastEmitAt = timestampMs
            candidate = null
            candidateSince = null
            return direction
        }
        mode = RecognizerMode.CANDIDATE
        return null
    }

    private fun dominant(pitch: Float, roll: Float, config: GestureConfig): MotionDirection? {
        val ap = kotlin.math.abs(pitch)
        val ar = kotlin.math.abs(roll)
        if (ap < config.activationDeg && ar < config.activationDeg) return null
        return if (ap >= ar) {
            if (ap < config.activationDeg || (ar > 0f && ap < ar * config.dominance)) return null
            if (pitch >= 0f) MotionDirection.UP else MotionDirection.DOWN
        } else {
            if (ar < config.activationDeg || (ap > 0f && ar < ap * config.dominance)) return null
            if (roll >= 0f) MotionDirection.RIGHT else MotionDirection.LEFT
        }
    }

    private fun isNeutral(pitch: Float, roll: Float, resetDeg: Float): Boolean =
        kotlin.math.abs(pitch) <= resetDeg && kotlin.math.abs(roll) <= resetDeg

    private fun configFor(sensitivity: MotionSensitivity): GestureConfig = when (sensitivity) {
        MotionSensitivity.LOW -> GestureConfig(18f, 7f, 240L, 900L, 0.32f, 1.25f)
        MotionSensitivity.HIGH -> GestureConfig(8f, 3.5f, 120L, 560L, 0.55f, 1.15f)
        MotionSensitivity.MEDIUM -> GestureConfig(12f, 5f, 170L, 700L, 0.42f, 1.2f)
    }
}
