"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { SimpleSong } from "@/types/songlist-types/songsitem";
import "./SongListPanel.scss";

interface SongListPanelProps {
  songList: SimpleSong[];
  coversList: string[];
  currentSong: SimpleSong | null;
  isPlaying: boolean;
  onSelect: (songIndex: number) => void;
}

interface ImageLoadState {
  status: "loading" | "loaded" | "error";
  attempts: number;
  url: string;
}

export default function SongListPanel({
  songList,
  coversList,
  currentSong,
  isPlaying,
  onSelect,
}: SongListPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // 使用 useState 替代 forceUpdate，减少不必要的重渲染
  const imageLoadStatesRef = useRef<Map<string, ImageLoadState>>(new Map());
  const [imageStateVersion, setImageStateVersion] = useState(0);

  // 虚拟滚动配置
  const ITEM_HEIGHT = 72;
  const BUFFER_SIZE = 3; // 减少缓冲区大小，减少不必要的渲染
  const MAX_RETRY_ATTEMPTS = 2;
  const MAX_CACHE_SIZE = 150; // 减少缓存大小

  // 使用 useMemo 优化可见范围计算，避免频繁重计算
  const { startIndex, endIndex, visibleItems, totalHeight, offsetY } =
    useMemo(() => {
      const start = Math.max(
        0,
        Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE
      );
      const end = Math.min(
        songList.length - 1,
        Math.floor((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
      );

      return {
        startIndex: start,
        endIndex: end,
        visibleItems: songList.slice(start, end + 1),
        totalHeight: songList.length * ITEM_HEIGHT,
        offsetY: start * ITEM_HEIGHT,
      };
    }, [songList, scrollTop, containerHeight, ITEM_HEIGHT, BUFFER_SIZE]);

  // 当前可见项的 hash 集合
  const visibleHashes = useMemo(() => {
    const hashes = new Set<string>();
    for (let i = startIndex; i <= endIndex; i++) {
      if (songList[i]) {
        hashes.add(songList[i].hash);
      }
    }
    return hashes;
  }, [songList, startIndex, endIndex]);

  // 防抖的图片状态更新
  const updateImageStateDebounced = useCallback((callback: () => void) => {
    const timer = setTimeout(() => {
      callback();
      setImageStateVersion((prev) => prev + 1);
    }, 16); // 约一帧的时间

    return () => clearTimeout(timer);
  }, []);

  // 清理不再可见的图片缓存
  const cleanupImageCache = useCallback(() => {
    const cache = imageLoadStatesRef.current;

    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      const toDelete = entries.filter(([hash]) => !visibleHashes.has(hash));

      const deleteCount = Math.min(
        toDelete.length,
        cache.size - MAX_CACHE_SIZE + 30
      );
      for (let i = 0; i < deleteCount; i++) {
        cache.delete(toDelete[i][0]);
      }
    }
  }, [visibleHashes, MAX_CACHE_SIZE]);

  // 减少清理频率，避免频繁操作
  useEffect(() => {
    const cleanup = () => {
      cleanupImageCache();
    };

    const interval = setInterval(cleanup, 15000); // 增加到15秒
    return () => clearInterval(interval);
  }, [cleanupImageCache]);

  const formatTime = (timelen?: number) => {
    if (!timelen) return "--:--";
    const minutes = Math.floor(timelen / 60000);
    const seconds = Math.floor((timelen % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  // 优化滚动处理，使用 requestAnimationFrame
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      setScrollTop(newScrollTop);
    });
  }, []);

  useEffect(() => {
    const updateContainerHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateContainerHeight();

    const resizeObserver = new ResizeObserver(updateContainerHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const scrollToCurrentSong = useCallback(() => {
    if (!currentSong || !containerRef.current) return;
    const currentIndex = songList.findIndex(
      (song) => song.hash === currentSong.hash
    );
    if (currentIndex === -1) return;
    const targetScrollTop =
      currentIndex * ITEM_HEIGHT - containerHeight / 2 + ITEM_HEIGHT / 2;
    containerRef.current.scrollTo({
      top: Math.max(
        0,
        Math.min(targetScrollTop, totalHeight - containerHeight)
      ),
      behavior: "smooth",
    });
  }, [currentSong, songList, containerHeight, totalHeight]);

  useEffect(() => {
    if (currentSong) {
      scrollToCurrentSong();
    }
  }, [currentSong, scrollToCurrentSong]);

  // 优化的图片组件
  const CoverImage: React.FC<{
    src: string;
    alt: string;
    hash: string;
  }> = React.memo(({ src, alt, hash }) => {
    const cache = imageLoadStatesRef.current;

    // 获取或设置图片状态
    const getImageState = useCallback(
      (hash: string, src: string): ImageLoadState => {
        if (!src) {
          const errorState = { status: "error" as const, attempts: 0, url: "" };
          cache.set(hash, errorState);
          return errorState;
        }

        let existing = cache.get(hash);
        if (!existing) {
          let finalUrl = src;
          if (src.startsWith("//")) finalUrl = "https:" + src;
          else if (!src.startsWith("http")) finalUrl = "https://" + src;

          const newState = {
            status: "loading" as const,
            attempts: 0,
            url: finalUrl,
          };
          cache.set(hash, newState);
          return newState;
        }
        return existing;
      },
      [cache]
    );

    const imageState = getImageState(hash, src);

    const handleLoad = useCallback(() => {
      updateImageStateDebounced(() => {
        const state = cache.get(hash);
        if (state) {
          cache.set(hash, { ...state, status: "loaded" });
        }
      });
    }, [hash, cache, updateImageStateDebounced]);

    const handleError = useCallback(() => {
      updateImageStateDebounced(() => {
        const state = cache.get(hash);
        if (!state) return;

        if (state.attempts >= MAX_RETRY_ATTEMPTS) {
          cache.set(hash, { ...state, status: "error" });
          return;
        }

        if (state.attempts === 0 && !state.url.includes("/api/proxy-image")) {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`;
          cache.set(hash, {
            status: "loading",
            attempts: state.attempts + 1,
            url: proxyUrl,
          });
        } else {
          cache.set(hash, {
            ...state,
            status: "error",
            attempts: state.attempts + 1,
          });
        }
      });
    }, [hash, src, cache, updateImageStateDebounced]);

    if (!imageState.url) {
      return (
        <div className="cover-container">
          <div className="cover-placeholder">无封面</div>
        </div>
      );
    }

    return (
      <div className="cover-container">
        {imageState.status !== "error" && (
          <img
            src={imageState.url}
            alt={alt}
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
        {imageState.status === "error" && (
          <div className="cover-placeholder">加载失败</div>
        )}
      </div>
    );
  });

  // 组件卸载时清理所有缓存
  useEffect(() => {
    return () => {
      imageLoadStatesRef.current.clear();
    };
  }, []);

  return (
    <div className="song-list-panel virtual-scroll with-covers">
      <div className="list-header">
        <h3>歌曲列表 ({songList.length})</h3>
        {currentSong && (
          <button
            className="scroll-to-current"
            onClick={scrollToCurrentSong}
            title="滚动到当前播放歌曲"
          >
            定位当前
          </button>
        )}
      </div>

      <div
        className="virtual-scroll-container"
        ref={containerRef}
        onScroll={handleScroll}
        style={{ height: "calc(100% - 60px)" }}
      >
        <div className="virtual-scroll-content" style={{ height: totalHeight }}>
          <div
            className="visible-items"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {visibleItems.map((song, index) => {
              const actualIndex = startIndex + index;
              const isCurrentSong = currentSong?.hash === song.hash;
              const coverUrl = coversList[actualIndex] || "";
              return (
                <div
                  key={`${song.hash}-${actualIndex}`} // 更稳定的 key
                  className={`song-item ${isCurrentSong ? "active" : ""}`}
                  style={{ height: ITEM_HEIGHT }}
                  onClick={() => onSelect(actualIndex)}
                >
                  <div className="song-index">{actualIndex + 1}</div>
                  <CoverImage src={coverUrl} alt={song.name} hash={song.hash} />
                  <div className="song-info">
                    <div className="song-name" title={song.name}>
                      {song.name}
                    </div>
                    <div className="song-meta">
                      {song.remark && (
                        <span className="artist" title={song.remark}>
                          {song.remark}
                        </span>
                      )}
                      <span className="duration">
                        {formatTime(song.timelen)}
                      </span>
                    </div>
                  </div>
                  {isCurrentSong && isPlaying && (
                    <div className="playing-indicator">
                      <div className="playing-bars">
                        <div className="bar"></div>
                        <div className="bar"></div>
                        <div className="bar"></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
