import { useEffect, useMemo, useState } from "react";

const DAM_PHOTOS = [
  "/dam-photos/babhali barrage.JPG",
  "/dam-photos/DJI_0010.JPG",
  "/dam-photos/DJI_0230.JPG",
  "/dam-photos/DJI_0416.DNG",
  "/dam-photos/DJI_0856.JPG",
  "/dam-photos/DJI_0914.JPG",
  "/dam-photos/DJI_0923.JPG",
  "/dam-photos/Ghatghar.JPG",
  "/dam-photos/IMG_20220714_180309.jpg",
  "/dam-photos/kolkewadi.JPG",
  "/dam-photos/mula.JPG",
  "/dam-photos/radhanagari.JPG",
  "/dam-photos/tembhu 1.DNG",
  "/dam-photos/tembhu 2.JPG",
  "/dam-photos/tembhu.DNG",
  "/dam-photos/Totladoh.JPG",
];

export const RadialBackground = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  const imageLayers = useMemo(() => {
    return DAM_PHOTOS.map((src) => encodeURI(src));
  }, []);

  useEffect(() => {
    if (imageLayers.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % imageLayers.length);
    }, 9000);

    return () => window.clearInterval(timer);
  }, [imageLayers.length]);

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-slate-900"
      aria-hidden="true"
    >
      {imageLayers.map((src, index) => (
        <div
          key={src}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
            index === activeIndex ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url("${src}")`,
            transitionDuration: "2200ms",
            filter: "saturate(1.08) contrast(1.06)",
          }}
        />
      ))}
    </div>
  );
};
