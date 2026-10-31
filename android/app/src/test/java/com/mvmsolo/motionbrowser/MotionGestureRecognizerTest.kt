package com.mvmsolo.motionbrowser

import org.junit.Assert.assertEquals
import org.junit.Test

class MotionGestureRecognizerTest {
    private fun hold(
        recognizer: MotionGestureRecognizer,
        pitch: Float,
        roll: Float,
        from: Long,
        to: Long,
        step: Long = 50L
    ): List<MotionDirection> {
        val emitted = mutableListOf<MotionDirection>()
        var time = from
        while (time <= to) {
            recognizer.feed(pitch, roll, time)?.let(emitted::add)
            time += step
        }
        return emitted
    }

    @Test
    fun ignoresSmallNoise() {
        val recognizer = MotionGestureRecognizer()
        val values = listOf(2f, -1f, 3f, 0f, -2f, 4f)
        val emitted = values.mapIndexedNotNull { index, pitch ->
            recognizer.feed(pitch, if (index % 2 == 0) -1f else 1f, index * 40L)
        }
        assertEquals(emptyList<MotionDirection>(), emitted)
    }

    @Test
    fun emitsOnlyOnceWhileTiltIsHeld() {
        val recognizer = MotionGestureRecognizer()
        assertEquals(
            listOf(MotionDirection.UP),
            hold(recognizer, pitch = 20f, roll = 0f, from = 0L, to = 1500L)
        )
    }

    @Test
    fun requiresNeutralReturnAndCooldownBeforeAnotherGesture() {
        val recognizer = MotionGestureRecognizer()
        val emitted = mutableListOf<MotionDirection>()
        emitted += hold(recognizer, 20f, 0f, 0L, 250L)
        emitted += hold(recognizer, 0f, 0f, 300L, 600L)
        emitted += hold(recognizer, 20f, 0f, 650L, 1400L)
        assertEquals(listOf(MotionDirection.UP, MotionDirection.UP), emitted)
    }

    @Test
    fun mapsFourDirectionsAndRejectsAnEvenDiagonal() {
        assertEquals(
            listOf(MotionDirection.LEFT),
            hold(MotionGestureRecognizer(), 0f, -20f, 0L, 400L)
        )
        assertEquals(
            listOf(MotionDirection.RIGHT),
            hold(MotionGestureRecognizer(), 0f, 20f, 0L, 400L)
        )
        assertEquals(
            emptyList<MotionDirection>(),
            hold(MotionGestureRecognizer(), 20f, 20f, 0L, 400L)
        )
    }
}
