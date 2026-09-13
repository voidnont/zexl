package tools.zexl.demo

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.FastOutSlowInEasing
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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import tools.zexl.client.AudioFormat
import tools.zexl.client.ConverterClient

private val Ink = Color(0xFF07080A)
private val Glass = Color(0x8A15171B)
private val GlassLine = Color.White.copy(alpha = 0.12f)
private val Muted = Color(0xFF8F929B)
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
    // Replace with your Render URL after deployment.
    val client = remember { ConverterClient("https://YOUR-SERVICE.onrender.com") }
    var url by remember { mutableStateOf(sharedUrl) }
    var format by remember { mutableStateOf(AudioFormat.MP3) }
    var progress by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("ready") }
    var currentTitle by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val infinite = rememberInfiniteTransition(label = "ambient")
    val drift by infinite.animateFloat(
        initialValue = -18f,
        targetValue = 26f,
        animationSpec = infiniteRepeatable(
            animation = tween(7000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "drift"
    )
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
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF0B0D11), Ink, Color(0xFF050607))
                    )
                )
        ) {
            AmbientGlow(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .offset(x = (-95).dp + drift.dp, y = (-55).dp)
                    .size(260.dp),
                color = Acid.copy(alpha = 0.14f * glow)
            )
            AmbientGlow(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = 95.dp, y = drift.dp)
                    .size(300.dp),
                color = Color(0xFF91A8FF).copy(alpha = 0.13f)
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.Center
            ) {
                GlassPanel(
                    modifier = Modifier.fillMaxWidth(),
                    cornerRadius = 30
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(29.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color.White.copy(alpha = 0.055f))
                                    .border(1.dp, GlassLine, RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(9.dp)
                                        .clip(CircleShape)
                                        .background(Acid)
                                        .graphicsLayer { alpha = glow }
                                )
                            }
                            Spacer(Modifier.size(10.dp))
                            Text(
                                "ZEXL",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 2.sp
                            )
                        }
                        Text(
                            "AUDIO CONVERTER",
                            color = Color.White.copy(alpha = 0.36f),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp
                        )
                    }

                    Spacer(Modifier.height(34.dp))
                    Text(
                        "ONE LINK. THREE FORMATS.",
                        color = Color.White.copy(alpha = 0.38f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "drop a link.",
                        color = Color.White,
                        fontSize = 43.sp,
                        lineHeight = 43.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (-1.9).sp
                    )
                    Text(
                        "keep the sound.",
                        color = Color(0xFFA9ACB5),
                        fontSize = 43.sp,
                        lineHeight = 43.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (-1.9).sp
                    )
                    Spacer(Modifier.height(17.dp))
                    Text(
                        "Turn supported media into MP3, FLAC, or WAV. Your hosted Render converter handles the heavy work.",
                        color = Muted,
                        fontSize = 14.sp,
                        lineHeight = 21.sp
                    )

                    Spacer(Modifier.height(28.dp))
                    GlassInput(
                        value = url,
                        onValueChange = { url = it },
                        enabled = !busy
                    )

                    Spacer(Modifier.height(20.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "OUTPUT FORMAT",
                            color = Color.White.copy(alpha = 0.43f),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp
                        )
                        Text("CHOOSE ONE", color = Color.White.copy(alpha = 0.24f), fontSize = 9.sp)
                    }
                    Spacer(Modifier.height(9.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AudioFormat.entries.forEach { option ->
                            FormatGlassOption(
                                option = option,
                                selected = format == option,
                                modifier = Modifier.weight(1f),
                                onClick = { if (!busy) format = option }
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    GlassPanel(
                        modifier = Modifier.fillMaxWidth(),
                        cornerRadius = 18,
                        innerPadding = 14
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "AUTHENTICATED SOURCES",
                                    color = Color.White.copy(alpha = 0.62f),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = .9.sp
                                )
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    "Host apps can pass SessionAuth for allowed non-DRM media.",
                                    color = Color.White.copy(alpha = 0.34f),
                                    fontSize = 11.sp,
                                    lineHeight = 15.sp
                                )
                            }
                            Text("OPTIONAL", color = Acid.copy(alpha = 0.58f), fontSize = 9.sp)
                        }
                    }

                    if (busy || status != "ready") {
                        Spacer(Modifier.height(12.dp))
                        ConversionStatus(
                            status = status,
                            progress = progress,
                            title = currentTitle
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            busy = true
                            progress = 0
                            status = "waking converter"
                            currentTitle = null
                            scope.launch {
                                runCatching {
                                    client.convertAndWait(url, format) { job ->
                                        progress = job.progress
                                        status = when (job.status) {
                                            "queued" -> "in queue"
                                            "working" -> "converting"
                                            else -> job.status
                                        }
                                        currentTitle = job.title
                                    }
                                }.onSuccess { job ->
                                    currentTitle = job.title
                                    progress = 100
                                    client.enqueueDownload(context, job)
                                    status = "download started"
                                }.onFailure {
                                    progress = 0
                                    status = it.message ?: "conversion failed"
                                }
                                busy = false
                            }
                        },
                        enabled = !busy && url.isNotBlank(),
                        shape = RoundedCornerShape(18.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Acid,
                            contentColor = Color(0xFF111409),
                            disabledContainerColor = Acid.copy(alpha = 0.42f),
                            disabledContentColor = Color(0xFF20250F)
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                    ) {
                        Text(
                            if (busy) "$status · $progress%" else "convert audio  →",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 14.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Spacer(Modifier.height(22.dp))
                    Text(
                        "Use only media you have permission to download. DRM and access-control bypasses are not supported.",
                        color = Color.White.copy(alpha = 0.27f),
                        fontSize = 10.sp,
                        lineHeight = 15.sp
                    )
                    Spacer(Modifier.height(11.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(width = 18.dp, height = 1.dp).background(Acid.copy(alpha = .55f)))
                        Spacer(Modifier.size(7.dp))
                        Text(
                            "signed by void",
                            fontSize = 10.sp,
                            color = Color.White.copy(alpha = 0.43f),
                            letterSpacing = 1.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AmbientGlow(modifier: Modifier, color: Color) {
    Box(
        modifier = modifier
            .blur(62.dp)
            .clip(CircleShape)
            .background(Brush.radialGradient(listOf(color, Color.Transparent)))
    )
}

@Composable
private fun GlassPanel(
    modifier: Modifier = Modifier,
    cornerRadius: Int = 24,
    innerPadding: Int = 22,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(cornerRadius.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.075f),
                        Glass,
                        Color.White.copy(alpha = 0.025f)
                    )
                )
            )
            .border(1.dp, GlassLine, shape)
            .padding(innerPadding.dp),
        content = content
    )
}

@Composable
private fun GlassInput(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean
) {
    val shape = RoundedCornerShape(20.dp)
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        label = {
            Text(
                "MEDIA LINK",
                fontSize = 10.sp,
                letterSpacing = 1.sp,
                fontWeight = FontWeight.Bold
            )
        },
        placeholder = { Text("https://…", color = Color.White.copy(alpha = .22f)) },
        shape = shape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color(0x99101216),
            unfocusedContainerColor = Color(0x66101216),
            disabledContainerColor = Color(0x44101216),
            focusedBorderColor = Acid.copy(alpha = .40f),
            unfocusedBorderColor = GlassLine,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            focusedLabelColor = Acid.copy(alpha = .65f),
            unfocusedLabelColor = Color.White.copy(alpha = .34f),
            cursorColor = Acid
        )
    )
}

@Composable
private fun FormatGlassOption(
    option: AudioFormat,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val selectedAmount by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.62f, stiffness = 440f),
        label = "formatSelection"
    )
    val shape = RoundedCornerShape(17.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val detail = when (option) {
        AudioFormat.MP3 -> "compact"
        AudioFormat.FLAC -> "lossless"
        AudioFormat.WAV -> "raw audio"
    }

    Column(
        modifier = modifier
            .graphicsLayer {
                scaleX = 1f + selectedAmount * .025f
                scaleY = 1f + selectedAmount * .025f
                translationY = -selectedAmount * 4f
            }
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = if (selected) {
                        listOf(Acid.copy(alpha = .17f), Color.White.copy(alpha = .055f))
                    } else {
                        listOf(Color.White.copy(alpha = .05f), Color.White.copy(alpha = .018f))
                    }
                )
            )
            .border(
                1.dp,
                if (selected) Acid.copy(alpha = .34f) else Color.White.copy(alpha = .09f),
                shape
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 14.dp)
    ) {
        Text(
            option.name,
            color = if (selected) Color(0xFFF7FFE0) else Color.White.copy(alpha = .78f),
            fontWeight = FontWeight.ExtraBold,
            fontSize = 13.sp
        )
        Spacer(Modifier.height(3.dp))
        Text(
            detail,
            color = if (selected) Color(0xFFBAC98E) else Color.White.copy(alpha = .32f),
            fontSize = 9.sp
        )
    }
}

@Composable
private fun ConversionStatus(status: String, progress: Int, title: String?) {
    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        cornerRadius = 18,
        innerPadding = 15
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "CONVERSION",
                    color = Color.White.copy(alpha = .28f),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    title ?: status,
                    color = Color.White.copy(alpha = .82f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text("$progress%", color = Acid.copy(alpha = .72f), fontSize = 11.sp)
        }
        Spacer(Modifier.height(10.dp))
        LinearProgressIndicator(
            progress = { progress.coerceIn(0, 100) / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .height(5.dp)
                .clip(CircleShape),
            color = Acid,
            trackColor = Color.White.copy(alpha = .06f)
        )
        Spacer(Modifier.height(8.dp))
        Text(status, color = Color.White.copy(alpha = .38f), fontSize = 10.sp)
    }
}
