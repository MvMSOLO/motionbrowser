package com.mvmsolo.motionbrowser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AddressResolverTest {
    @Test
    fun aliasesResolveToHttpsAndMotionLabStaysInternal() {
        assertEquals(
            AddressResult.Navigate("https://www.instagram.com/"),
            AddressResolver.resolve("Instagram")
        )
        assertEquals(
            AddressResult.Navigate("https://www.youtube.com/"),
            AddressResolver.resolve("yt")
        )
        assertEquals(AddressResult.MotionLab, AddressResolver.resolve("motion lab"))
    }

    @Test
    fun httpIsUpgradedAndSearchPhrasesBecomeDuckDuckGoUrls() {
        assertEquals(
            AddressResult.Navigate("https://example.com/docs?q=1#top"),
            AddressResolver.resolve("http://example.com/docs?q=1#top")
        )
        val search = AddressResolver.resolve("quiet observatories") as AddressResult.Search
        assertEquals("quiet observatories", search.query)
        assertTrue(search.url.startsWith("https://duckduckgo.com/?q="))
    }

    @Test
    fun rejectsDangerousSchemesCredentialsAndPrivateHosts() {
        listOf(
            "javascript:alert(1)",
            "file:///etc/passwd",
            "content://contacts",
            "data:text/html,hi",
            "intent://scan/#Intent;end",
            "https://user:pass@example.com",
            "https://127.0.0.1",
            "https://127.1",
            "https://0177.0.0.1",
            "https://2130706433",
            "https://0x7f.0x0.0x0.0x1",
            "https://10.0.0.1",
            "https://192.168.1.10",
            "https://169.254.1.2",
            "https://localhost",
            "https://printer.local"
        ).forEach { value ->
            assertTrue("$value should be rejected", AddressResolver.resolve(value) is AddressResult.Error)
        }
    }

    @Test
    fun socialAndAuthenticationPagesAreNeverKeptInsideTheWebView() {
        assertTrue(AddressResolver.isRestricted("https://www.instagram.com/"))
        assertTrue(AddressResolver.isRestricted("https://accounts.google.com/signin"))
        assertTrue(AddressResolver.isRestricted("https://example.com/oauth/start"))
        assertFalse(AddressResolver.isRestricted("https://example.com/article"))
    }
}
