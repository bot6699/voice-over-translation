import debug from "./debug.js";
import { availableLangs } from "../config/constants.js";
import { langTo6391 } from "./utils.js";
import { localizationProvider } from "../localization/localizationProvider.js";

const udemyAPIURL = "https://www.udemy.com/api-2.0";
const accessTokenLife = 2_592_000_000; // 30 days

async function getCourseLang(courseId) {
  const response = await fetch(
    `${udemyAPIURL}/courses/${courseId}/?` +
      new URLSearchParams({
        "fields[course]": "locale",
        use_remote_version: "true",
        caching_intent: "true",
      }),
  );
  return await response.json();
}

function checkUdemyTokenExpire(expires) {
  return expires + accessTokenLife > new Date().getTime();
}

async function getLectureData(udemyData, courseId, lectureId) {
  // reference: https://greasyfork.org/ru/scripts/422576-udemy-subtitle-downloader-v3/code
  if (!checkUdemyTokenExpire(udemyData.expires) || !udemyData.accessToken) {
    console.error(localizationProvider.get("udemyAccessTokenExpired"));
    return undefined;
  }

  const bearerToken = `Bearer ${udemyData.accessToken}`;
  const response = await fetch(
    `${udemyAPIURL}/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?` +
      new URLSearchParams({
        "fields[lecture]": "asset",
        "fields[asset]": "length,media_sources,captions",
      }),
    {
      headers: {
        "x-udemy-authorization": bearerToken,
        authorization: bearerToken,
      },
    },
  );
  return await response.json();
}

function getSubtitlesFileURL(captions, detectedLanguage, responseLang) {
  let subtitle = captions?.find(
    (caption) => langTo6391(caption.locale_id) === detectedLanguage,
  );

  if (!subtitle) {
    subtitle =
      captions?.find(
        (caption) => langTo6391(caption.locale_id) === responseLang,
      ) || captions?.[0];
  }

  return subtitle?.url;
}

function getVideoFileURLFromAPI(sources) {
  const source = sources?.find(
    (src) => src.type === "video/webm" || src.type === "video/mp4",
  );

  return source?.src;
}

function getPlayerData() {
  return getPlayer()?.player;
}

function getModuleData() {
  const moduleArgs = document.querySelector(
    ".ud-app-loader[data-module-id='course-taking']",
  )?.dataset?.moduleArgs;
  if (!moduleArgs) {
    console.error(localizationProvider.get("udemyModuleArgsNotFound"));
    return {};
  }
  return JSON.parse(moduleArgs);
}

function getLectureId() {
  return window.location.pathname.match(/learn\/lecture\/([^/]+)/)?.[1];
}

function getPlayer() {
  return document.querySelector(".vjs-v7");
}

function getVideoURLFromPlayer() {
  const src = getPlayer()?.querySelector("video")?.src;
  return src?.startsWith("blob:") ? false : src;
}

// Get the video data from the player
async function getVideoData(udemyData, responseLang = "en") {
  let translationHelp = null;
  const data = getPlayerData();
  debug.log("udemyData", udemyData);

  const moduleData = getModuleData();
  debug.log("moduleData: ", moduleData);

  const courseId = moduleData.courseId;
  const lectureId = getLectureId();
  debug.log(`CourseId: ${courseId}, lectureId: ${lectureId}`);

  const courseLang = await getCourseLang(courseId);
  debug.log("courseLang Data:", courseLang);
  const lectureData = await getLectureData(udemyData, courseId, lectureId);
  console.log("lecture Data:", lectureData);

  let detectedLanguage = courseLang?.locale?.locale;
  detectedLanguage = detectedLanguage ? langTo6391(detectedLanguage) : "en";

  if (!availableLangs.includes(detectedLanguage)) {
    detectedLanguage = "en";
  }

  const duration = lectureData?.asset?.length || data?.cache_?.duration;
  const videoURL =
    getVideoFileURLFromAPI(lectureData?.asset?.media_sources) ||
    getVideoURLFromPlayer();
  const subtitlesURL = getSubtitlesFileURL(
    lectureData?.asset?.captions,
    detectedLanguage,
    responseLang,
  );

  console.log(`videoURL: ${videoURL}, subtitlesURL: ${subtitlesURL}`);

  if (subtitlesURL && videoURL) {
    translationHelp = [
      {
        target: "video_file_url",
        targetUrl: videoURL,
      },
      {
        target: "subtitles_file_url",
        targetUrl: subtitlesURL,
      },
    ];
  } else {
    console.error(
      `Failed to find subtitlesURL or videoURL. videoURL: ${videoURL}, subtitlesURL: ${subtitlesURL}`,
    );
  }

  const videoData = {
    duration,
    detectedLanguage,
    translationHelp,
  };

  debug.log("udemy video data:", videoData);
  console.log("[VOT] Detected language: ", videoData.detectedLanguage);
  return videoData;
}

export const udemyUtils = {
  getPlayer,
  getPlayerData,
  getVideoData,
  getModuleData,
  getCourseLang,
  getLectureData,
};
