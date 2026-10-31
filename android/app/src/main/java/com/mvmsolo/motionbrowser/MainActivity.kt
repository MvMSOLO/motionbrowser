package com.mvmsolo.motionbrowser

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.ImageView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

private const val COLOR_BG = 0xFF070A12.toInt()
private const val COLOR_FG = 0xFFE7EEF6.toInt()
private const val COLOR_MUTED = 0xFF93A0B3.toInt()
private const val COLOR_ACCENT = 0xFF54D9F2.toInt()
private const val COLOR_LINE = 0xFF243044.toInt()
private const val COLOR_PANEL = 0xFF101722.toInt()
private const val COLOR_INNER = 0xFF0B1018.toInt()
private const val COLOR_SUCCESS = 0xFF8FD0B4.toInt()
private const val COLOR_WARNING = 0xFFE3B08A.toInt()

private data class LabCard(val title: String, val body: String, val comments: List<String>)

class MainActivity : AppCompatActivity(), SensorEventListener {
    private enum class Screen { HOME, LAB, WEB }

    private val labCards = listOf(
        LabCard(
            "Neytralni ushlab turing",
            "Harakat bir marta ishlaydi. Telefon egilgan holda qolsa, keyingi kartochka o‘zi ochilmaydi. Avval neytralga qayting.",
            listOf("Kalibrlash qulay holatni nol deb oladi.", "Bitta egish faqat bitta qadam beradi.",
                "Keyingi harakatdan oldin neytralga qayting.", "Teginish tugmalari doim ishlaydi.")
        ),
        LabCard(
            "Yuqoriga — keyingi kartochka",
            "Telefonning yuqorisini o‘zingizdan nari egish bitta keyingi yozuvni ochadi. Usiz ushlab turish harakatni takrorlamaydi.",
            listOf("Past sezuvchanlik kattaroq egishni talab qiladi.", "O‘rta sezuvchanlik odatiy tanlov.",
                "Yuqori sezuvchanlik kichikroq egishni qabul qiladi.", "Diagonal egish e’tiborsiz qoldiriladi.")
        ),
        LabCard(
            "Pastga — oldingi kartochka",
            "Pastga egish ro‘yxatda aynan bitta qadam orqaga qaytaradi. Chegarada turib qoladi, aylanib ketmaydi.",
            listOf("Birinchi kartochkada indeks noldan pastga tushmaydi.",
                "Izohlar ochiq bo‘lsa, yuqori va past aylantiradi.",
                "Chapga egish izohlarni ochadi.", "O‘ngga egish ochiq izohlarni yopadi.")
        ),
        LabCard(
            "Freym va haqiqiy sayt",
            "Manzil satriga example.com yozing. U haqiqiy sahifa. Instagram va YouTube esa tashqi brauzerda ochiladi.",
            listOf("WebView har bir saytni bir xil ko‘rsatmaydi.",
                "X-Frame-Options chetlab o‘tilmaydi.",
                "Sayt nusxasi server orqali olinmaydi.",
                "Harakat boshqa saytga soxta swipe yubormaydi.")
        ),
        LabCard(
            "Teginish har doim qoladi",
            "Sensor yo‘q, ruxsat berilmadi yoki harakat o‘chiq bo‘lsa ham tugmalar kartochka va izohlarni boshqaradi.",
            listOf("Ovoz va tebranish bu buildda o‘chiq.",
                "Sensor mavjud bo‘lmasa, teginish boshqaruvi ishlashda davom etadi.",
                "3D observatoriya keyingi native polish bosqichida ulanadi.")
        ),
        LabCard(
            "Native Android",
            "Bu oddiy veb sahifa emas: manzillar native Android WebView’da ochiladi, harakat esa Android sensoridan olinadi.",
            listOf("Sensor namunalari qurilmadan tashqariga yuborilmaydi.",
                "Begona sahifalarga native JavaScript ko‘prigi berilmaydi.",
                "Harakat faqat birinchi tomon Motion Lab’ni boshqaradi.")
        )
    )

    private lateinit var addressInput: EditText
    private lateinit var statusText: TextView
    private lateinit var contentFrame: FrameLayout
    private lateinit var homePanel: LinearLayout
    private lateinit var labPanel: LinearLayout
    private lateinit var webView: WebView
    private lateinit var backButton: TextView
    private lateinit var forwardButton: TextView
    private lateinit var reloadButton: TextView
    private lateinit var outsideButton: TextView
    private lateinit var motionButton: TextView
    private lateinit var calibrateButton: TextView
    private lateinit var sensitivityButton: TextView
    private lateinit var labTitle: TextView
    private lateinit var labBody: TextView
    private lateinit var labCounter: TextView
    private lateinit var commentsPanel: LinearLayout
    private lateinit var commentsText: TextView
    private lateinit var commentsScroll: ScrollView

    private lateinit var sensorManager: SensorManager
    private var rotationSensor: Sensor? = null
    private var activityResumed = false
    private var motionEnabled = false
    private var hasSensorSample = false
    private var calibrated = false
    private var baselinePitch = 0f
    private var baselineRoll = 0f
    private var rawPitch = 0f
    private var rawRoll = 0f
    private var labIndex = 0
    private var commentsOpen = false
    private var sensitivity = MotionSensitivity.MEDIUM
    private var currentScreen = Screen.HOME
    private val recognizer = MotionGestureRecognizer()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = COLOR_BG
        window.navigationBarColor = COLOR_BG
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)

        buildInterface()
        configureWebView()
        updateLabCard()
        updateNavigationButtons()
        updateMotionControls()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    currentScreen == Screen.WEB && webView.canGoBack() -> webView.goBack()
                    currentScreen != Screen.HOME -> showHome()
                    else -> finish()
                }
            }
        })
    }

    private fun buildInterface() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setBackgroundColor(COLOR_BG)
        }
        val rootPadding = intArrayOf(dp(14), dp(10), dp(14), dp(10))
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(
                rootPadding[0] + bars.left,
                rootPadding[1] + bars.top,
                rootPadding[2] + bars.right,
                rootPadding[3] + maxOf(bars.bottom, ime.bottom)
            )
            insets
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(2), 0, dp(8))
        }
        val mark = ImageView(this).apply {
            setImageResource(R.drawable.motion_browser_mark)
            contentDescription = null
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams = LinearLayout.LayoutParams(dp(42), dp(42)).apply { rightMargin = dp(10) }
        }
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        brand.addView(text("MOTION BROWSER", 13f, COLOR_ACCENT, true))
        brand.addView(text("Fazoviy brauzer · native", 11f, COLOR_MUTED))
        header.addView(mark)
        header.addView(brand, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(actionButton("Sozlamalar", false) { showSettings() })
        root.addView(header)

        val addressRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(0xFF0C121B.toInt(), COLOR_LINE, 24)
            setPadding(dp(12), dp(3), dp(4), dp(3))
        }
        addressInput = EditText(this).apply {
            hint = "Manzil yoki qidiruv"
            setHintTextColor(COLOR_MUTED)
            setTextColor(COLOR_FG)
            textSize = 15f
            isSingleLine = true
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            background = null
            setPadding(dp(4), dp(7), dp(4), dp(7))
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_GO) {
                    openAddress(addressInput.text?.toString().orEmpty())
                    true
                } else false
            }
        }
        addressRow.addView(addressInput, LinearLayout.LayoutParams(0, dp(48), 1f))
        addressRow.addView(actionButton("Ochish", true) {
            openAddress(addressInput.text?.toString().orEmpty())
        })
        root.addView(addressRow)

        val navRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(7), 0, dp(2))
        }
        backButton = navButton("‹") { if (webView.canGoBack()) webView.goBack() }
        forwardButton = navButton("›") { if (webView.canGoForward()) webView.goForward() }
        reloadButton = navButton("↻") { webView.reload() }
        val homeButton = navButton("⌂") { showHome() }
        outsideButton = navButton("↗") { webView.url?.let(::openOutside) }
        listOf(backButton, forwardButton, reloadButton, homeButton, outsideButton).forEach { button ->
            navRow.addView(button, LinearLayout.LayoutParams(0, dp(42), 1f).apply {
                marginEnd = dp(5)
            })
        }
        root.addView(navRow)

        statusText = text("Harakat ixtiyoriy. Faqat HTTPS manzillar ochiladi.", 12f, COLOR_MUTED).apply {
            setPadding(dp(2), dp(5), dp(2), dp(8))
        }
        root.addView(statusText)

        contentFrame = FrameLayout(this).apply {
            background = rounded(COLOR_INNER, COLOR_LINE, 20)
            clipToOutline = true
        }
        root.addView(contentFrame, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ).apply { topMargin = dp(2) })

        webView = WebView(this).apply { visibility = View.GONE }
        contentFrame.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        homePanel = buildHomePanel()
        contentFrame.addView(homePanel, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        labPanel = buildLabPanel().apply { visibility = View.GONE }
        contentFrame.addView(labPanel, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        val footer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }
        motionButton = actionButton("Harakat: o‘chiq", false) { toggleMotion() }
        calibrateButton = actionButton("Kalibr", false) { calibrateMotion() }
        sensitivityButton = actionButton("O‘rta", false) { chooseSensitivity() }
        listOf(motionButton, calibrateButton, sensitivityButton).forEachIndexed { index, button ->
            footer.addView(button, LinearLayout.LayoutParams(0, dp(46), 1f).apply {
                if (index > 0) marginStart = dp(6)
            })
        }
        root.addView(footer)
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
    }

    private fun buildHomePanel(): LinearLayout {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(22), dp(24), dp(22), dp(24))
        }
        val eyebrow = text("MOTION / SPATIAL BROWSER", 11f, COLOR_ACCENT, true)
        eyebrow.letterSpacing = 0.13f
        panel.addView(eyebrow)
        panel.addView(space(12))
        panel.addView(text("Internetga boshqa\nnuqtai nazardan.", 28f, COLOR_FG, true))
        panel.addView(space(10))
        panel.addView(text(
            "Native Android WebView, xavfsiz HTTPS navigatsiyasi va qurilma harakatiga asoslangan Motion Lab.",
            14f, COLOR_MUTED
        ))
        panel.addView(space(22))
        panel.addView(actionButton("Motion Lab demo", true) { showLab() })
        panel.addView(space(8))
        panel.addView(actionButton("example.com ochish", false) { openAddress("example.com") })
        panel.addView(space(22))
        val note = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(COLOR_PANEL, COLOR_LINE, 16)
            setPadding(dp(14), dp(13), dp(14), dp(13))
        }
        note.addView(text("NATIVE BUILD · 0.1.0", 10f, COLOR_SUCCESS, true))
        note.addView(space(5))
        note.addView(text(
            "Harakat faqat Motion Lab ichida boshqaruv beradi. Boshqa saytga soxta swipe yuborilmaydi.",
            12f, COLOR_MUTED
        ))
        panel.addView(note)
        return panel
    }

    private fun buildLabPanel(): LinearLayout {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        val eyebrow = text("MOTION LAB / FIRST-PARTY DEMO", 10f, COLOR_ACCENT, true)
        eyebrow.letterSpacing = 0.12f
        panel.addView(eyebrow)
        panel.addView(space(8))
        labCounter = text("01 / 06", 11f, COLOR_MUTED)
        panel.addView(labCounter)
        panel.addView(space(8))

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(COLOR_PANEL, COLOR_LINE, 18)
            setPadding(dp(16), dp(17), dp(16), dp(17))
        }
        labTitle = text("", 21f, COLOR_FG, true)
        labBody = text("", 14f, COLOR_MUTED)
        card.addView(labTitle)
        card.addView(space(10))
        card.addView(labBody)
        panel.addView(card, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        panel.addView(space(10))

        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actions.addView(actionButton("Oldingi", false) { moveLab(-1) },
            LinearLayout.LayoutParams(0, dp(44), 1f))
        actions.addView(actionButton("Keyingi", false) { moveLab(1) },
            LinearLayout.LayoutParams(0, dp(44), 1f).apply { marginStart = dp(6) })
        actions.addView(actionButton("Izohlar", true) { toggleComments() },
            LinearLayout.LayoutParams(0, dp(44), 1f).apply { marginStart = dp(6) })
        panel.addView(actions)
        panel.addView(space(10))

        commentsPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(0xFF16130F.toInt(), 0xFF3A3128.toInt(), 16)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            visibility = View.GONE
        }
        commentsPanel.addView(text("IZOHLAR", 10f, COLOR_WARNING, true))
        commentsScroll = ScrollView(this).apply {
            isFillViewport = true
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        commentsText = text("", 13f, 0xFFD9CEC2.toInt())
        commentsScroll.addView(commentsText)
        commentsPanel.addView(commentsScroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(120)
        ))
        panel.addView(commentsPanel, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        panel.addView(space(8))
        val sensorDescription = if (rotationSensor == null) "Sensor: topilmadi" else "Sensor: tayyor"
        panel.addView(text("$sensorDescription · Namuna qurilmadan chiqmaydi.", 11f, COLOR_MUTED))
        return panel
    }

    private fun configureWebView() {
        val isDebuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        WebView.setWebContentsDebuggingEnabled(isDebuggable)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                routeWebNavigation(request.url.toString(), request.isForMainFrame)

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                routeWebNavigation(url, true)

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                statusText.text = "Sahifa yuklanmoqda…"
                updateNavigationButtons()
            }

            override fun onPageFinished(view: WebView, url: String) {
                val host = runCatching { Uri.parse(url).host ?: url }.getOrDefault(url)
                statusText.text = "Haqiqiy sayt · $host"
                updateNavigationButtons()
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    statusText.text = "Sahifa yuklanmadi. Tashqarida ochib ko‘rishingiz mumkin."
                }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel()
                statusText.text = "SSL sertifikati ishonchli emas. Ulanish bekor qilindi."
            }
        }
        webView.setDownloadListener { _, _, _, _, _ ->
            statusText.text = "Yuklab olish hozircha o‘chiq."
        }
    }

    private fun routeWebNavigation(address: String, mainFrame: Boolean): Boolean {
        return when (val result = AddressResolver.resolve(address)) {
            is AddressResult.Navigate -> {
                val restricted = AddressResolver.isRestricted(result.url)
                if (!mainFrame) {
                    restricted || result.url != address
                } else if (restricted) {
                    openOutside(result.url)
                    true
                } else if (result.url != address) {
                    webView.loadUrl(result.url)
                    true
                } else {
                    false
                }
            }
            is AddressResult.Search -> {
                if (mainFrame) webView.loadUrl(result.url)
                true
            }
            AddressResult.MotionLab -> {
                if (mainFrame) showLab()
                true
            }
            is AddressResult.Error -> {
                if (mainFrame) statusText.text = result.message
                true
            }
        }
    }

    private fun openAddress(input: String) {
        when (val result = AddressResolver.resolve(input)) {
            is AddressResult.Navigate -> {
                if (AddressResolver.isRestricted(result.url)) openOutside(result.url)
                else loadInApp(result.url)
            }
            is AddressResult.Search -> loadInApp(result.url)
            AddressResult.MotionLab -> showLab()
            is AddressResult.Error -> statusText.text = result.message
        }
    }

    private fun loadInApp(url: String) {
        addressInput.setText(url)
        currentScreen = Screen.WEB
        homePanel.visibility = View.GONE
        labPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        statusText.text = "Sahifa yuklanmoqda…"
        webView.loadUrl(url)
        updateNavigationButtons()
    }

    private fun showHome() {
        currentScreen = Screen.HOME
        webView.stopLoading()
        webView.visibility = View.GONE
        labPanel.visibility = View.GONE
        homePanel.visibility = View.VISIBLE
        addressInput.setText("")
        statusText.text = "Harakat ixtiyoriy. Faqat HTTPS manzillar ochiladi."
        recognizer.reset()
        updateNavigationButtons()
    }

    private fun showLab() {
        currentScreen = Screen.LAB
        webView.stopLoading()
        webView.visibility = View.GONE
        homePanel.visibility = View.GONE
        labPanel.visibility = View.VISIBLE
        addressInput.setText("motion lab")
        recognizer.reset()
        updateLabCard()
        statusText.text = if (motionEnabled && calibrated) {
            "Motion Lab faol. Neytralga qaytib, bir yo‘nalishga egiling."
        } else {
            "Motion Lab demo. Sensor uchun avval yoqing va kalibrlang."
        }
        updateNavigationButtons()
    }

    private fun openOutside(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setToolbarColor(COLOR_BG)
                .setShowTitle(true)
                .build()
                .launchUrl(this, Uri.parse(url))
        } catch (_: ActivityNotFoundException) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (_: ActivityNotFoundException) {
                statusText.text = "Bu manzilni ochadigan tashqi brauzer topilmadi."
            }
        }
    }

    private fun updateNavigationButtons() {
        if (!::backButton.isInitialized) return
        val isWeb = currentScreen == Screen.WEB
        backButton.isEnabled = isWeb && webView.canGoBack()
        forwardButton.isEnabled = isWeb && webView.canGoForward()
        reloadButton.isEnabled = isWeb
        outsideButton.isEnabled = isWeb && !webView.url.isNullOrBlank()
        listOf(backButton, forwardButton, reloadButton, outsideButton).forEach {
            it.alpha = if (it.isEnabled) 1f else 0.35f
        }
    }

    private fun moveLab(step: Int) {
        labIndex = (labIndex + step).coerceIn(0, labCards.lastIndex)
        updateLabCard()
    }

    private fun toggleComments() {
        commentsOpen = !commentsOpen
        commentsPanel.visibility = if (commentsOpen) View.VISIBLE else View.GONE
        if (!commentsOpen) commentsScroll.scrollTo(0, 0)
        statusText.text = if (commentsOpen) {
            "Izohlar ochiq. Yuqori/past egish izohlarni aylantiradi."
        } else "Izohlar yopildi."
    }

    private fun updateLabCard() {
        if (!::labTitle.isInitialized) return
        val card = labCards[labIndex]
        labTitle.text = card.title
        labBody.text = card.body
        labCounter.text = "%02d / %02d".format(labIndex + 1, labCards.size)
        commentsText.text = card.comments.joinToString("\n\n") { "•  $it" }
        commentsPanel.visibility = if (commentsOpen) View.VISIBLE else View.GONE
    }

    private fun toggleMotion() {
        if (rotationSensor == null) {
            statusText.text = "Bu qurilmada rotation sensor topilmadi. Teginish boshqaruvi qoladi."
            return
        }
        motionEnabled = !motionEnabled
        calibrated = false
        recognizer.reset()
        if (motionEnabled && activityResumed) registerMotionSensor()
        else sensorManager.unregisterListener(this)
        updateMotionControls()
        statusText.text = if (motionEnabled) {
            "Harakat yoqildi. Motion Lab ichida qulay holatni ushlab, Kalibr bosing."
        } else "Harakat o‘chiq. Teginish boshqaruvi doim ishlaydi."
    }

    private fun registerMotionSensor() {
        val sensor = rotationSensor ?: return
        val registered = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        if (!registered) {
            motionEnabled = false
            calibrated = false
            statusText.text = "Sensor ishga tushmadi. Teginish boshqaruvi qoladi."
            updateMotionControls()
        }
    }

    private fun calibrateMotion() {
        if (!motionEnabled) {
            statusText.text = "Avval Harakat tugmasini yoqing."
            return
        }
        if (!hasSensorSample) {
            statusText.text = "Sensor hali namuna bermadi. Telefonni ushlab biroz kuting."
            return
        }
        baselinePitch = rawPitch
        baselineRoll = rawRoll
        calibrated = true
        recognizer.reset()
        statusText.text = "Neytral holat saqlandi. Endi sekin egishingiz mumkin."
        updateMotionControls()
    }

    private fun updateMotionControls() {
        if (!::motionButton.isInitialized) return
        motionButton.text = if (motionEnabled) "Harakat: yoqilgan" else "Harakat: o‘chiq"
        motionButton.setTextColor(if (motionEnabled) COLOR_ACCENT else COLOR_FG)
        calibrateButton.isEnabled = motionEnabled
        calibrateButton.alpha = if (motionEnabled) 1f else 0.4f
        sensitivityButton.text = when (sensitivity) {
            MotionSensitivity.LOW -> "Past"
            MotionSensitivity.MEDIUM -> "O‘rta"
            MotionSensitivity.HIGH -> "Yuqori"
        }
    }

    private fun chooseSensitivity() {
        val options = arrayOf("Past", "O‘rta", "Yuqori")
        val selected = when (sensitivity) {
            MotionSensitivity.LOW -> 0
            MotionSensitivity.MEDIUM -> 1
            MotionSensitivity.HIGH -> 2
        }
        AlertDialog.Builder(this)
            .setTitle("Sezuvchanlik")
            .setSingleChoiceItems(options, selected) { dialog, which ->
                sensitivity = when (which) {
                    0 -> MotionSensitivity.LOW
                    2 -> MotionSensitivity.HIGH
                    else -> MotionSensitivity.MEDIUM
                }
                recognizer.reset()
                updateMotionControls()
                dialog.dismiss()
            }
            .setNegativeButton("Yopish", null)
            .show()
    }

    private fun showSettings() {
        val options = arrayOf("Motion Lab demo", "Sezuvchanlik", "Tashqi saytlar va maxfiylik")
        AlertDialog.Builder(this)
            .setTitle("Motion Browser")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> showLab()
                    1 -> chooseSensitivity()
                    2 -> AlertDialog.Builder(this)
                        .setTitle("Xavfsiz navigatsiya")
                        .setMessage(
                            "Faqat HTTPS sahifalar ochiladi. Mahalliy tarmoq manzillari bloklanadi. " +
                                "Login va ijtimoiy tarmoq sahifalari tashqi brauzerga uzatiladi. " +
                                "Begona sahifalarga JavaScript orqali native imkoniyat berilmaydi. " +
                                "Harakat namunalari qurilmada qayta ishlanadi va saqlanmaydi."
                        )
                        .setPositiveButton("Tushunarli", null)
                        .show()
                }
            }
            .setNegativeButton("Yopish", null)
            .show()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR &&
            event.sensor.type != Sensor.TYPE_GAME_ROTATION_VECTOR
        ) return

        val rotationMatrix = FloatArray(9)
        val screenMatrix = FloatArray(9)
        val orientation = FloatArray(3)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        val axes = when (windowManager.defaultDisplay.rotation) {
            android.view.Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
            android.view.Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
            android.view.Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
            else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
        }
        SensorManager.remapCoordinateSystem(rotationMatrix, axes.first, axes.second, screenMatrix)
        SensorManager.getOrientation(screenMatrix, orientation)

        rawPitch = Math.toDegrees(orientation[1].toDouble()).toFloat()
        rawRoll = Math.toDegrees(orientation[2].toDouble()).toFloat()
        hasSensorSample = true

        if (!motionEnabled || !calibrated || currentScreen != Screen.LAB) return
        val direction = recognizer.feed(
            rawPitch - baselinePitch,
            rawRoll - baselineRoll,
            SystemClock.elapsedRealtime(),
            sensitivity
        ) ?: return
        applyMotionDirection(direction)
    }

    private fun applyMotionDirection(direction: MotionDirection) {
        if (currentScreen != Screen.LAB) return
        if (commentsOpen) {
            when (direction) {
                MotionDirection.UP -> commentsScroll.smoothScrollBy(0, dp(160))
                MotionDirection.DOWN -> commentsScroll.smoothScrollBy(0, -dp(160))
                MotionDirection.RIGHT -> toggleComments()
                MotionDirection.LEFT -> Unit
            }
            return
        }
        when (direction) {
            MotionDirection.UP -> moveLab(1)
            MotionDirection.DOWN -> moveLab(-1)
            MotionDirection.LEFT -> toggleComments()
            MotionDirection.RIGHT -> Unit
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onResume() {
        super.onResume()
        activityResumed = true
        if (motionEnabled) {
            calibrated = false
            recognizer.reset()
            registerMotionSensor()
            statusText.text = "Ilova qaytdi. Xavfsizlik uchun harakatni qayta kalibrlang."
            updateMotionControls()
        }
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onPause() {
        activityResumed = false
        sensorManager.unregisterListener(this)
        if (motionEnabled) {
            calibrated = false
            recognizer.reset()
        }
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        calibrated = false
        recognizer.reset()
        if (::statusText.isInitialized && motionEnabled) {
            statusText.text = "Ekran yo‘nalishi o‘zgardi. Qayta kalibrlang."
        }
    }

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.webChromeClient = null
            webView.webViewClient = WebViewClient()
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
            includeFontPadding = false
            gravity = Gravity.CENTER_VERTICAL
            setLineSpacing(dp(2).toFloat(), 1f)
        }

    private fun actionButton(label: String, emphasized: Boolean, onClick: () -> Unit): TextView =
        TextView(this).apply {
            text = label
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(if (emphasized) COLOR_ACCENT else COLOR_FG)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            minHeight = dp(44)
            setPadding(dp(10), dp(7), dp(10), dp(7))
            background = if (emphasized) rounded(0xFF14343D.toInt(), 0xFF1D5562.toInt(), 16)
                else rounded(0xFF121A26.toInt(), COLOR_LINE, 16)
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
        }

    private fun navButton(label: String, onClick: () -> Unit): TextView =
        actionButton(label, false, onClick).apply {
            textSize = 22f
            setPadding(0, 0, 0, 0)
            background = rounded(0xFF121A26.toInt(), COLOR_LINE, 14)
        }

    private fun rounded(fill: Int, stroke: Int, radiusDp: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(fill)
            cornerRadius = dp(radiusDp).toFloat()
            setStroke(dp(1), stroke)
        }

    private fun space(heightDp: Int): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(1, dp(heightDp))
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()
}
