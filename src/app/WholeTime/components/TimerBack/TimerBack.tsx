"use client";
import "./TimerBack.scss";
import { useState, useEffect } from "react";
export default function TimerBack() {
  const [countDownTime, setCountDownTime] = useState<number>(0);
  const [inputMin, setInputMin] = useState<string>("");
  const [isOn, setIsOn] = useState<boolean>(false);
  //将输入的分转换成秒
  const change = () => {
    const min = Number(inputMin) || 0;
    if (min > 0) {
      setCountDownTime(min * 60);
      setIsOn(false);
    }
  };
  useEffect(() => {
    let timer: any;
    if (isOn && countDownTime > 0) {
      timer = setInterval(() => {
        setCountDownTime((prev) => prev - 1);
      }, 1000);
    } else if (countDownTime === 0 && isOn) {
      setIsOn(false);
    }
    return () => clearInterval(timer);
  }, [isOn, countDownTime]);
  const format = (seconds: number) => {
    return seconds.toString().padStart(2, "0");
  };
  const hour = Math.floor(countDownTime / 3600);
  const minutes = Math.floor((countDownTime % 3600) / 60);
  const seconds = Math.floor(countDownTime % 60);
  //重置
  const handlePause = () => {
    setIsOn(false);
    setCountDownTime(0);
    setInputMin("");
  };
  return (
    <div className="countdown">
      <div className="time-input">
        <input
          type="text"
          value={inputMin}
          onChange={(e) => {
            setInputMin(e.target.value);
          }}
          placeholder="输入几分钟"
        />

        <button onClick={change}>设置</button>
      </div>

      <div className="time-display">
        {format(hour)}:{format(minutes)}:{format(seconds)}
      </div>

      <div className="buttons">
        <button
          onClick={() => {
            setIsOn(true);
          }}
        >
          开始
        </button>
        <button
          onClick={() => {
            setIsOn(false);
          }}
        >
          暂停
        </button>
        <button onClick={handlePause}>重置</button>
      </div>
    </div>
  );
}
