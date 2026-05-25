document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".nav-logo").forEach(function (logo) {
    const video = logo.querySelector(".nav-logo-video");

    if (!video) {
      return;
    }

    function useFallback() {
      logo.classList.remove("video-ready");
      logo.classList.add("video-failed");
    }

    video.addEventListener("canplay", function () {
      logo.classList.add("video-ready");
      logo.classList.remove("video-failed");
    }, { once: true });

    video.addEventListener("error", useFallback, { once: true });

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(useFallback);
    }
  });
});
