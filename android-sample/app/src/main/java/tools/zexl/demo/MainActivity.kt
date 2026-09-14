package tools.zexl.demo

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import tools.zexl.client.AudioFormat
import tools.zexl.client.ConversionFailedException
import tools.zexl.client.ConverterClient

private val Ink = Color(0xFF07080A)
private val Glass = Color(0x8A15171B)
private val Acid = Color(0xFFDFFF72)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val shared = if (intent?.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        } else {
            ""
        }
        setContent { ZexlScreen(shared) }
    }
}

@Composable
private fun ZexlScreen(sharedUrl: String) {
    val client = remember { ConverterClient("https://YOUR-SERVICE.onrender.com") }
    var url by remember { mutableStateOf(sharedUrl) }
    var format by remember { mutableStateOf(AudioFormat.MP3) }
    var progress by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("ready") }
    var title by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var challengeUrl by remember { mutableStateOf<String?>(null) }
    var challengeCode by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val canOpenSource = challengeUrl != null && challengeCode in setOf(
        "login_required", "captcha_required", "consent_required", "age_check"
    )
    val infinite = rememberInfiniteTransition(label = "ambient")
    val glow by infinite.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )

    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Ink,
            surface = Color(0xFF111318),
            primary = Acid,
            onPrimary = Color(0xFF111409)
        )
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.linearGradient(listOf(Color(0xFF0B0D11), Ink, Color(0xFF050607))))
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
                verticalArrangement = Arrangement.Center
            ) {
                GlassPanel(Modifier.fillMaxWidth(), cornerRadius = 24) {
                    Text("ZEXL", color = Color.White, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "drop a link.",
                        color = Color.White,
                        fontSize = 31.sp,
                        lineHeight = 31.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "keep the sound.",
                        color = Color(0xFFA9ACB5),
                        fontSize = 31.sp,
                        lineHeight = 31.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "YouTube uses ZEXL's hosted InnerTube-first pipeline; other supported sources use the hosted extractor too.",
                        color = Color.White.copy(alpha = .5f),
                        fontSize = 12.sp
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = url,
                        onValueChange = { url = it },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("media link") }
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        AudioFormat.entries.forEach { option ->
                            FormatGlassOption(
                                option = option,
                                selected = format == option,
                                modifier = Modifier.weight(1f)
                            ) {
                                if (!busy) format = option
                            }
                        }
                    }
                    if (busy || status != "ready") {
                        Spacer(Modifier.height(12.dp))
                        ConversionStatus(status, progress, title)
                    }
                    if (canOpenSource) {
                        Spacer(Modifier.height(10.dp))
                        Button(
                            onClick = {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(requireNotNull(challengeUrl)))
                                )
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White.copy(alpha = .12f)
                            )
                        ) {
                            Text("Open source")
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = {
                            busy = true
                            progress = 0
                            status = "waking converter"
                            title = null
                            challengeUrl = null
                            challengeCode = null
                            scope.launch {
                                runCatching {
                                    client.convertSmart(context, url, format) { job ->
                                        progress = job.progress
                                        status = when (job.status) {
                                            "queued" -> "in queue"
                                            "working", "converting" -> "converting"
                                            else -> job.status
                                        }
                                        title = job.title
                                    }
                                }.onSuccess { job ->
                                    challengeUrl = null
                                    challengeCode = null
                                    title = job.title
                                    progress = 100
                                    client.enqueueDownload(context, job)
                                    status = "download started"
                                }.onFailure { error ->
                                    progress = 0
                                    if (error is ConversionFailedException) {
                                        challengeUrl = error.job.sourceUrl
                                        challengeCode = error.job.errorCode
                                    } else {
                                        challengeUrl = null
                                        challengeCode = null
                                    }
                                    status = error.message ?: "conversion failed"
                                }
                                busy = false
                            }
                        },
                        enabled = !busy && url.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Acid)
                    ) {
                        Text(
                            if (busy) "$status · $progress%" else "convert audio  →",
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GlassPanel(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 20,
    innerPadding: Int = 18,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(cornerRadius.dp)
    Column(
        modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        Color.White.copy(alpha = .075f),
                        Glass,
                        Color.White.copy(alpha = .025f)
                    )
                )
            )
            .border(1.dp, Color.White.copy(alpha = .12f), shape)
            .padding(innerPadding.dp),
        content = content
    )
}

@Composable
private fun FormatGlassOption(
    option: AudioFormat,
    selected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val scale by animateFloatAsState(
        targetValue = if (selected) 1f else .97f,
        animationSpec = spring(),
        label = "format-scale"
    )
    Box(
        modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) Acid.copy(alpha = .18f) else Color.White.copy(alpha = .05f))
            .clickable(onClick = onClick)
            .padding(vertical = 18.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            option.name,
            color = if (selected) Acid else Color.White,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ConversionStatus(status: String, progress: Int, title: String?) {
    Column(Modifier.fillMaxWidth()) {
        Text(title ?: status, color = Color.White, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { progress.coerceIn(0, 100) / 100f },
            modifier = Modifier.fillMaxWidth()
        )
    }
}
