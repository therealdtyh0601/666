const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

const MAX_DURATION = 300;

function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/[*_~`|]/g, "").trim();
}

async function getVideoDuration(file) {
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.src = URL.createObjectURL(file);
  });
}

async function processVideo(file) {
  if (!ffmpeg.isLoaded()) {
    document.getElementById("status").innerText = "Loading ffmpeg...";
    await ffmpeg.load();
  }

  ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file));

  // simple scale rule (browser-safe)
  await ffmpeg.run(
    "-i", "input.mp4",
    "-vf", "scale=-1:1080",
    "-preset", "veryfast",
    "output.mp4"
  );

  const data = ffmpeg.FS("readFile", "output.mp4");
  return new Blob([data.buffer], { type: "video/mp4" });
}

document.getElementById("processBtn").onclick = async () => {
  const file = document.getElementById("videoInput").files[0];
  if (!file) return alert("No video selected");

  const duration = await getVideoDuration(file);
  if (duration > MAX_DURATION) {
    alert("Video exceeds 5 minutes");
    return;
  }

  const captionInput = document.getElementById("caption");
  captionInput.value = sanitizeText(captionInput.value);

  document.getElementById("status").innerText = "Processing video...";

  const outputBlob = await processVideo(file);

  const link = document.getElementById("downloadLink");
  link.href = URL.createObjectURL(outputBlob);
  link.download = "cleaned_video.mp4";
  link.style.display = "block";
  link.innerText = "⬇ Download Processed Video";

  document.getElementById("status").innerText = "Done.";
};
