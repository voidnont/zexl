package tools.zexl.demo

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import tools.zexl.client.AudioFormat
import tools.zexl.client.ConverterClient

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val shared = if (intent?.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty() else ""
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
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current

    MaterialTheme(colorScheme = darkColorScheme(background = Color(0xFF0B0B0D), surface = Color(0xFF141417))) {
        Column(
            modifier = Modifier.fillMaxSize().background(Color(0xFF0B0B0D)).padding(24.dp),
            verticalArrangement = Arrangement.Center
        ) {
            Text("drop a link.", fontSize = 38.sp, color = Color.White)
            Text("get audio.", fontSize = 38.sp, color = Color(0xFF9B9BA4))
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(value = url, onValueChange = { url = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Media link") }, singleLine = true)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AudioFormat.entries.forEach { option ->
                    FilterChip(selected = format == option, onClick = { format = option }, label = { Text(option.name) })
                }
            }
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = {
                    busy = true
                    scope.launch {
                        runCatching {
                            client.convertAndWait(url, format) { job ->
                                progress = job.progress
                                status = job.status
                            }
                        }.onSuccess { job ->
                            client.enqueueDownload(context, job)
                            status = "download started"
                        }.onFailure { status = it.message ?: "failed" }
                        busy = false
                    }
                },
                enabled = !busy && url.isNotBlank(),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (busy) "$status · $progress%" else "convert") }
            Spacer(Modifier.height(18.dp))
            Text("signed by void", fontSize = 12.sp, color = Color(0xFF6F6F79))
        }
    }
}
