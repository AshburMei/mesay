import { clear, time } from "console";
import "./Timer.scss";
import { useState, useEffect, use } from "react";
export default function Timer() {
  const [countTime, setCountTime] = useState<number>(0);
  const [isOn, setIsOn] = useState<Boolean>(false);
  useEffect(() => {
    let timer: any;
    if (isOn) {
      timer = setInterval(() => {
        setCountTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOn]);
  //格式化时间
  const format = (seconds: any) => {
    return String(seconds).padStart(2, "0");
  };
  const hour = Math.floor(countTime / 3600);
  const minutes = Math.floor((countTime % 3600) / 60);
  const seconds = countTime % 60;
  //暂停
  const handlePause = () => {
    setIsOn(false);
    setCountTime(0);
  };
  return (
    <div className="timer">
      <div className="time-display">
        {format(hour)}:{format(minutes)}:{format(seconds)}
      </div>
      <div className="buttons">
        <button onClick={() => setIsOn(true)}>开始</button>
        <button onClick={() => setIsOn(false)}>暂停</button>
        <button onClick={handlePause}>重置</button>
      </div>
    </div>
  );
}
