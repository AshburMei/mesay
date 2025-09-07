"use client";
import React, { useState, useRef, useEffect } from "react";
import SearchBar from "./components/SearchBar/SearchBar";
import "./globals.css";
import Login from "./components/Login/Login";
import WebAudioPlayer from "./components/SongList/SongList";
import Time from "./components/Time/Time";
export default function Home() {
  const [searchData, setSearchData] = useState<any>("");
  //状态管理
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  //搜索
  const handleSearch = async (keyword: string) => {
    if (!keyword) return;
    setIsLoading(true);
    try {
      const searchresponse = await fetch(
        `http://localhost:3000/search?keywords=${keyword}`
      );
      const searchData = await searchresponse.json();
      setSearchData(searchData);
    } catch (err) {
      setError("出现错误了呢");
    }
  };
  console.log(searchData);

  return (
    <div className="player-container">
      <div className="top-bar">
        <SearchBar onSearch={handleSearch} />
        <h1 className="player-title">MESong</h1>
        <Login />
        <Time />
      </div>

      <div className="song-list">
        <WebAudioPlayer />
      </div>
    </div>
  );
}
