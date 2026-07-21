const Video = require("../models/Video");

const SAMPLE_VIDEOS = [
  {
    title: "Big Buck Bunny",
    description: "Open movie perfect for testing synced watch parties.",
    thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/320px-Big_buck_bunny_poster_big.jpg",
    sourceUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    durationSeconds: 596,
    category: "Animation",
  },
  {
    title: "Elephants Dream",
    description: "Short film to stream together with friends.",
    thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Elephants_Dream_s5_both.jpg/320px-Elephants_Dream_s5_both.jpg",
    sourceUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    durationSeconds: 653,
    category: "Animation",
  },
  {
    title: "Sintel",
    description: "Fantasy adventure for group viewing sessions.",
    thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Sintel_poster.jpg/320px-Sintel_poster.jpg",
    sourceUrl: "https://media.w3.org/2010/05/sintel/trailer_hd.mp4",
    durationSeconds: 888,
    category: "Fantasy",
    isPremium: true,
  },
];

async function seedVideosIfEmpty() {
  const count = await Video.countDocuments();
  if (count === 0) {
    await Video.insertMany(SAMPLE_VIDEOS);
    console.log(`[Seed] Inserted ${SAMPLE_VIDEOS.length} sample videos.`);
  } else {
    for (const vid of SAMPLE_VIDEOS) {
      await Video.updateOne(
        { title: vid.title },
        { $set: { sourceUrl: vid.sourceUrl, isPremium: vid.isPremium || false } }
      );
    }
  }
}

module.exports = seedVideosIfEmpty;
