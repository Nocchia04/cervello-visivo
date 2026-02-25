"use client";

import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

interface InlineViewer360Props {
  url: string;
  zoom: number;
  onScroll?: (scrollLeft: number, scrollTop: number) => void;
  syncScroll?: { scrollLeft: number; scrollTop: number } | null;
}

export interface InlineViewer360Handle {
  getScrollPosition: () => { scrollLeft: number; scrollTop: number };
  setScrollPosition: (scrollLeft: number, scrollTop: number) => void;
}

const InlineViewer360 = forwardRef<InlineViewer360Handle, InlineViewer360Props>(
  function InlineViewer360({ url, zoom, onScroll, syncScroll }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isUpdatingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getScrollPosition: () => {
        const el = containerRef.current;
        return {
          scrollLeft: el?.scrollLeft ?? 0,
          scrollTop: el?.scrollTop ?? 0,
        };
      },
      setScrollPosition: (scrollLeft: number, scrollTop: number) => {
        const el = containerRef.current;
        if (el) {
          isUpdatingRef.current = true;
          el.scrollLeft = scrollLeft;
          el.scrollTop = scrollTop;
          requestAnimationFrame(() => {
            isUpdatingRef.current = false;
          });
        }
      },
    }));

    useEffect(() => {
      if (syncScroll && containerRef.current) {
        isUpdatingRef.current = true;
        containerRef.current.scrollLeft = syncScroll.scrollLeft;
        containerRef.current.scrollTop = syncScroll.scrollTop;
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
        });
      }
    }, [syncScroll]);

    const handleScroll = () => {
      if (isUpdatingRef.current || !onScroll || !containerRef.current) return;
      onScroll(
        containerRef.current.scrollLeft,
        containerRef.current.scrollTop
      );
    };

    return (
      <div
        ref={containerRef}
        className="w-full h-full overflow-auto bg-black"
        onScroll={handleScroll}
      >
        <img
          src={url}
          alt="Foto 360"
          style={{
            width: `${100 * zoom}%`,
            height: "auto",
            objectFit: "contain",
          }}
          draggable={false}
        />
      </div>
    );
  }
);

export default InlineViewer360;
