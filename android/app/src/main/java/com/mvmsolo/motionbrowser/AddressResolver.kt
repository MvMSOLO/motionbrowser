package com.mvmsolo.motionbrowser

import java.net.IDN
import java.net.InetAddress
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

sealed class AddressResult {
    data class Navigate(val url: String) : AddressResult()
    data class Search(val query: String, val url: String) : AddressResult()
    data object MotionLab : AddressResult()
    data class Error(val message: String) : AddressResult()
}

/** Native counterpart of the PWA resolver. External pages receive no native JS bridge. */
object AddressResolver {
    private val aliases = mapOf(
        "instagram" to "https://www.instagram.com/",
        "insta" to "https://www.instagram.com/",
        "ig" to "https://www.instagram.com/",
        "youtube" to "https://www.youtube.com/",
        "yt" to "https://www.youtube.com/",
        "wikipedia" to "https://en.wikipedia.org/",
        "wiki" to "https://en.wikipedia.org/",
        "example" to "https://example.com/"
    )
    private val labAliases = setOf("lab", "motion lab", "gesture lab", "motionlab")
    private val restrictedSuffixes = setOf(
        "instagram.com", "youtube.com", "youtu.be", "facebook.com", "fb.com",
        "tiktok.com", "twitter.com", "x.com", "accounts.google.com"
    )
    private val authPath = Regex("/(login|log-in|signin|sign-in|oauth|authorize|auth)(/|$)", RegexOption.IGNORE_CASE)
    private val schemePattern = Regex("^([a-z][a-z0-9+.-]*):", RegexOption.IGNORE_CASE)
    private val strictIpv4Pattern = Regex("^([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})\\.([0-9]{1,3})$")
    private val numericDottedPattern = Regex("^[0-9]+(?:\\.[0-9]+){0,3}$")
    private val hexDottedPattern = Regex("^0x[0-9a-f]+(?:\\.0x[0-9a-f]+){1,3}$", RegexOption.IGNORE_CASE)

    fun resolve(input: String): AddressResult {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return AddressResult.Error("Sayt nomi, domen yoki qidiruv yozing.")
        if (trimmed.length > 500) return AddressResult.Error("Manzil juda uzun.")

        val normalized = trimmed.replace(Regex("\\s+"), " ")
        val key = normalized.lowercase()
        if (key in labAliases) return AddressResult.MotionLab
        aliases[key]?.let { return acceptHttps(it) }

        val schemeMatch = schemePattern.find(trimmed)
        val candidate = if (schemeMatch != null) {
            when (schemeMatch.groupValues[1].lowercase()) {
                "https" -> trimmed
                "http" -> {
                    val rest = trimmed.substring(schemeMatch.range.last + 1)
                    if (!rest.startsWith("//")) return AddressResult.Error("Manzil formati noto‘g‘ri.")
                    "https:$rest"
                }
                else -> return AddressResult.Error("Bu sxema ochilmaydi.")
            }
        } else {
            if (normalized.any(Char::isWhitespace) || !normalized.contains('.')) {
                return search(normalized.take(180))
            }
            "https://$normalized"
        }
        return acceptHttps(candidate)
    }

    fun isRestricted(address: String): Boolean {
        val url = try { URL(address) } catch (_: Exception) { return true }
        if (url.protocol.lowercase() != "https") return true
        val host = url.host.trim('[', ']').lowercase().trimEnd('.')
        if (restrictedSuffixes.any { host == it || host.endsWith(".$it") }) return true
        if (host.startsWith("login.") || host.startsWith("accounts.")) return true
        return authPath.containsMatchIn(url.path)
    }

    private fun search(query: String): AddressResult {
        val encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.name())
        return AddressResult.Search(query, "https://duckduckgo.com/?q=$encoded")
    }

    private fun acceptHttps(candidate: String): AddressResult {
        val parsed = try { URL(candidate) } catch (_: Exception) {
            return AddressResult.Error("Manzil o‘qilmadi. Tekshirib, qayta yozing.")
        }
        if (parsed.protocol.lowercase() != "https") {
            return AddressResult.Error("Faqat HTTPS sahifalar ochiladi.")
        }
        if (!parsed.userInfo.isNullOrEmpty()) {
            return AddressResult.Error("Foydalanuvchi nomi yoki parol yozilgan manzil ochilmaydi.")
        }

        val rawHost = parsed.host.trim('[', ']')
        if (rawHost.isBlank()) return AddressResult.Error("Domen topilmadi.")
        val asciiHost = try {
            if (rawHost.contains(':')) rawHost.lowercase() else IDN.toASCII(rawHost).lowercase()
        } catch (_: IllegalArgumentException) {
            return AddressResult.Error("Domen nomi noto‘g‘ri.")
        }
        if (isBlockedHost(asciiHost)) {
            return AddressResult.Error("Mahalliy va yopiq tarmoq manzillari ochilmaydi.")
        }

        val rawUri = try { URI(candidate) } catch (_: Exception) {
            return AddressResult.Error("Manzil o‘qilmadi. Tekshirib, qayta yozing.")
        }
        val hostForUrl = if (asciiHost.contains(':')) "[$asciiHost]" else asciiHost
        val port = if (parsed.port >= 0) ":" + parsed.port else ""
        val path = rawUri.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
        val query = rawUri.rawQuery?.let { "?$it" } ?: ""
        val fragment = rawUri.rawFragment?.let { "#$it" } ?: ""
        return AddressResult.Navigate("https://$hostForUrl$port$path$query$fragment")
    }

    private fun isBlockedHost(hostname: String): Boolean {
        val host = hostname.lowercase().trimEnd('.')
        if (host.isBlank()) return true
        if (host == "localhost" || host.endsWith(".localhost") ||
            host.endsWith(".local") || host.endsWith(".internal") ||
            host == "metadata.google.internal" || host == "0.0.0.0"
        ) return true

        if (host.contains(':')) return isBlockedIpv6(host)
        if (hexDottedPattern.matches(host)) return true

        val ipv4 = strictIpv4Pattern.matchEntire(host)
        if (ipv4 != null) {
            val parts = ipv4.groupValues.drop(1).map { it.toInt() }
            if (parts.any { it !in 0..255 }) return true
            if (ipv4.groupValues.drop(1).any { it.length > 1 && it.startsWith('0') }) return true
            return isBlockedIpv4(parts[0], parts[1], parts[2], parts[3])
        }
        if (numericDottedPattern.matches(host)) return true
        if (host.all(Char::isDigit)) {
            val value = host.toLongOrNull() ?: return true
            if (value !in 0L..4294967295L) return true
            return isBlockedIpv4(
                ((value shr 24) and 255).toInt(),
                ((value shr 16) and 255).toInt(),
                ((value shr 8) and 255).toInt(),
                (value and 255).toInt()
            )
        }
        return false
    }

    private fun isBlockedIpv4(a: Int, b: Int, c: Int, d: Int): Boolean {
        val ip = (a.toLong() shl 24) or (b.toLong() shl 16) or (c.toLong() shl 8) or d.toLong()
        fun inCidr(aa: Int, bb: Int, cc: Int, dd: Int, bits: Int): Boolean {
            val base = (aa.toLong() shl 24) or (bb.toLong() shl 16) or (cc.toLong() shl 8) or dd.toLong()
            val mask = if (bits == 0) 0L else (0xffffffffL shl (32 - bits)) and 0xffffffffL
            return (ip and mask) == (base and mask)
        }
        return inCidr(0, 0, 0, 0, 8) ||
            inCidr(10, 0, 0, 0, 8) ||
            inCidr(100, 64, 0, 0, 10) ||
            inCidr(127, 0, 0, 0, 8) ||
            inCidr(169, 254, 0, 0, 16) ||
            inCidr(172, 16, 0, 0, 12) ||
            inCidr(192, 0, 0, 0, 24) ||
            inCidr(192, 0, 2, 0, 24) ||
            inCidr(192, 168, 0, 0, 16) ||
            inCidr(198, 18, 0, 0, 15) ||
            inCidr(198, 51, 100, 0, 24) ||
            inCidr(203, 0, 113, 0, 24) ||
            inCidr(224, 0, 0, 0, 4) ||
            inCidr(240, 0, 0, 0, 4)
    }

    private fun isBlockedIpv6(host: String): Boolean {
        if (host.contains('%')) return true
        val bytes = try { InetAddress.getByName(host).address } catch (_: Exception) { return true }
        if (bytes.size != 16) return true
        val first = bytes[0].toInt() and 0xff
        val second = bytes[1].toInt() and 0xff
        if (first != 0x20 && first != 0x30) return true
        if (first == 0x20 && second == 0x01 &&
            (bytes[2].toInt() and 0xff) == 0x0d && (bytes[3].toInt() and 0xff) == 0xb8
        ) return true
        if (first == 0x20 && second == 0x01 &&
            bytes.copyOfRange(2, 8).all { it.toInt() == 0 }
        ) return true
        if (first == 0x20 && second == 0x02) return true
        return false
    }
}
