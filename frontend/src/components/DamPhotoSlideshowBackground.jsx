import { useEffect, useMemo, useState } from "react";

const PHOTO_URLS = [
  "/images/dam-slideshow/GMIDC_babhali_barrage.JPG",
  "/images/dam-slideshow/GMIDC_DJI_0914.JPG",
  "/images/dam-slideshow/GMIDC_mula.JPG",
  "/images/dam-slideshow/KIDC_DJI_0010.JPG",
  "/images/dam-slideshow/KIDC_Ghatghar.JPG",
  "/images/dam-slideshow/KIDC_IMG_20220714_180309.jpg",
  "/images/dam-slideshow/MKVDC_DJI_0856.JPG",
  "/images/dam-slideshow/MKVDC_DJI_0923.JPG",
  "/images/dam-slideshow/MKVDC_kolkewadi.JPG",
  "/images/dam-slideshow/MKVDC_radhanagari.JPG",
  "/images/dam-slideshow/MKVDC_tembhu_2.JPG",
  "/images/dam-slideshow/TIDC_DJI_0230.JPG",
  "/images/dam-slideshow/VIDC_Totladoh.JPG",
];

const SLIDE_INTERVAL_MS = 6000;

export default function DamPhotoSlideshowBackground() {
  const photos = useMemo(() => PHOTO_URLS.filter(Boolean), []);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [photos]);

  if (photos.length === 0) {
    return <div className="fixed inset-0 -z-10 bg-slate-100" />;
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {photos.map((photo, index) => (
        <div
          key={photo}
          className="absolute inset-0 bg-center bg-cover transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${photo})`,
            opacity: index === currentIndex ? 1 : 0,
            transform: index === currentIndex ? "scale(1.04)" : "scale(1)",
            transition: "opacity 1s ease, transform 6s ease",
          }}
          aria-hidden="true"
        />
      ))}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.62) 0%, rgba(15,23,42,0.48) 45%, rgba(15,23,42,0.38) 100%)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
