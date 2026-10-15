package app.lad.testreceiver;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.json.JSONObject;

/** Test-only share target. Never opens Lad storage or logs the received content. */
public final class ShareReceiverActivity extends Activity {
    private static final long MAX_BYTES = 15_000_000L;
    private TextView status;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final long callbackStarted = SystemClock.elapsedRealtime();
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding, padding, padding);
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(padding + insets.getSystemWindowInsetLeft(),
                    padding + insets.getSystemWindowInsetTop(),
                    padding + insets.getSystemWindowInsetRight(),
                    padding + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView title = new TextView(this);
        title.setText("A04 Test Receiver");
        title.setTextSize(24);
        layout.addView(title);
        status = new TextView(this);
        status.setTextSize(17);
        status.setTextIsSelectable(true);
        status.setPadding(0, padding, 0, padding);
        layout.addView(status);
        Button close = new Button(this);
        close.setText("Закрыть приёмник");
        close.setOnClickListener(view -> finish());
        layout.addView(close);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);
        setContentView(scroll);

        Intent incoming = getIntent();
        if (!Intent.ACTION_SEND.equals(incoming.getAction())) {
            status.setText("Ожидание файла. В меню экспорта Лада выберите A04 Test Receiver.\n"
                    + "Только синтетические JSON/.ladbackup, до 15 000 000 байт.");
            return;
        }
        status.setText("Читаем переданный файл… Успех появится после полной записи и проверки.");
        new Thread(() -> capture(incoming, callbackStarted), "A04-share-copy").start();
    }

    @SuppressWarnings("deprecation")
    private Uri streamUri(Intent intent) {
        Uri uri = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) {
            ClipData clip = intent.getClipData();
            if (clip != null && clip.getItemCount() == 1) uri = clip.getItemAt(0).getUri();
        }
        return uri;
    }

    private void capture(Intent intent, long callbackStarted) {
        File partial = null;
        String phase = "intent";
        JSONObject receipt = new JSONObject();
        try {
            String mime = intent.getType();
            if (!"application/json".equals(mime) && !"application/octet-stream".equals(mime)) {
                throw new IOException("Unsupported MIME type");
            }
            Uri uri = streamUri(intent);
            if (uri == null || !"content".equals(uri.getScheme())) {
                throw new IOException("Expected one content URI");
            }
            receipt.put("mimeType", mime);
            receipt.put("callbackStartedAtEpochMs", System.currentTimeMillis()
                    - (SystemClock.elapsedRealtime() - callbackStarted));
            phase = "open-source";
            receipt.put("openStartedAfterCallbackMs", SystemClock.elapsedRealtime() - callbackStarted);
            // One ordinary URI read: no retry, fallback path or pre-seeded copy.
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IOException("Content provider returned no stream");
                File directory = new File(getFilesDir(), "received");
                if (!directory.isDirectory() && !directory.mkdirs()) {
                    throw new IOException("Cannot create destination directory");
                }
                String name = "received-" + System.currentTimeMillis() + "-"
                        + UUID.randomUUID().toString().substring(0, 8)
                        + ("application/json".equals(mime) ? ".json" : ".ladbackup");
                File destination = new File(directory, name);
                partial = new File(directory, name + ".part");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long count = 0;
                phase = "read-and-write";
                try (FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        count += read;
                        if (count > MAX_BYTES) throw new IOException("File exceeds 15 MB");
                        output.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                    }
                    if (count == 0) throw new IOException("Empty file");
                    output.getFD().sync();
                }
                receipt.put("readCompleteAfterCallbackMs", SystemClock.elapsedRealtime() - callbackStarted);
                phase = "verify-destination";
                String hash = hex(digest.digest());
                if (partial.length() != count || !hash.equals(fileHash(partial))) {
                    throw new IOException("Saved bytes do not match received bytes");
                }
                if (!partial.renameTo(destination)) throw new IOException("Cannot finalize file");
                receipt.put("status", "success");
                receipt.put("file", "files/received/" + name);
                receipt.put("bytes", count);
                receipt.put("sha256", hash);
            }
            phase = "write-receipt";
            receipt.put("completedAfterCallbackMs", SystemClock.elapsedRealtime() - callbackStarted);
            writeReceipt(receipt);
            String message = "SUCCESS — файл прочитан, сохранён и проверен.\n\n"
                    + receipt.getString("file") + "\nБайт: " + receipt.getLong("bytes")
                    + "\nSHA-256: " + receipt.getString("sha256")
                    + "\n\nМетаданные: files/last-receipt.json\n"
                    + "Финансовое равенство проверяется отдельно на компьютере.";
            runOnUiThread(() -> status.setText(message));
        } catch (Exception failure) {
            final String errorType = failure.getClass().getSimpleName();
            final String failedPhase = phase;
            try {
                receipt.put("status", "error");
                receipt.put("phase", failedPhase);
                receipt.put("errorType", errorType);
                receipt.put("completedAfterCallbackMs", SystemClock.elapsedRealtime() - callbackStarted);
                writeReceipt(receipt);
            } catch (Exception ignored) {
                // UI still reports failure if the diagnostic receipt cannot be written.
            }
            runOnUiThread(() -> status.setText("ERROR — приём файла не подтверждён.\n"
                    + "Этап: " + failedPhase + "\nОшибка: " + errorType
                    + "\nСохраните этот результат: источник мог стать недоступен. "
                    + "Автоматических повторов чтения нет."));
        } finally {
            if (partial != null && partial.exists()) partial.delete();
        }
    }

    private void writeReceipt(JSONObject receipt) throws IOException {
        AtomicFile file = new AtomicFile(new File(getFilesDir(), "last-receipt.json"));
        FileOutputStream output = file.startWrite();
        try {
            output.write(receipt.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (IOException failure) {
            file.failWrite(output);
            throw failure;
        }
    }

    private static String fileHash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) value.append(String.format("%02x", item & 0xff));
        return value.toString();
    }
}
