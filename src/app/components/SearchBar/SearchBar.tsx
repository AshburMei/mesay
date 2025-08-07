import React, { useState } from "react";
import { SearchBarProps } from "@/types/searchbar";
import "./SearchBar.scss";
//定义接口类型

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [keyword, setKeyword] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(keyword);
  };
  return (
    <form onSubmit={handleSubmit} className="search_form">
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="来听歌吧!"
        aria-label="关键词"
      />
      <p>&nbsp;</p>
      <button type="submit" className="search_button">
        SEARCH
      </button>
    </form>
  );
}
