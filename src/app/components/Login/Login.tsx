import React, { useState, useEffect } from "react";
import axios from "axios";
import "./Login.scss";

const Login = () => {
  const [showLoginBox, setShowLoginBox] = useState<boolean>(false);
  const [loginType, setLoginType] = useState<"mobile" | "wechat">("mobile");
  const [mobile, setMobile] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [isCodeSent, setIsCodeSent] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(0);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false); // 新增登录状态

  // WeChat login states
  const [qrCodeBase64, setQrCodeBase64] = useState<string>("");
  const [qrCodeLink, setQrCodeLink] = useState<string>("");
  const [uuid, setUuid] = useState<string>("");
  const [scanStatus, setScanStatus] = useState<number>(0);
  const [wxCode, setWxCode] = useState<string>("");
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  // 检查本地存储中的登录状态
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  const validateMobile = (phone: string): boolean => {
    return /^1[3-9]\d{9}$/.test(phone);
  };

  const handleSendCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mobile) {
      setError("请输入手机号");
      return;
    }
    if (!validateMobile(mobile)) {
      setError("请输入正确的手机号");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      await axios.get(`http://localhost:3000/captcha/sent?mobile=${mobile}`);
      setIsCodeSent(true);
      let count = 60;
      setCountdown(count);
      const timer = setInterval(() => {
        count--;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
        }
      }, 1000);
    } catch (error) {
      setError("发送验证码失败，请重试");
      console.error("发送验证码错误:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code) {
      setError("请输入验证码");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(
        `http://localhost:3000/login/cellphone?mobile=${mobile}&code=${code}`
      );
      console.log("登录成功:", response.data);
      const { token, vip_token } = response.data;
      localStorage.setItem("auth_token", token);
      localStorage.setItem("vip_token", vip_token);
      setIsLoggedIn(true);
      setShowLoginBox(false);
    } catch (error) {
      setError("登录失败，请检查验证码");
      console.error("登录错误:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateWeChatQRCode = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(`http://localhost:3000/login/wx/create`);
      const { errcode, uuid, qrcode } = response.data;

      if (errcode !== 0) {
        throw new Error("生成二维码失败");
      }

      setUuid(uuid);
      setQrCodeBase64(qrcode.qrcodebase64);
      setQrCodeLink(qrcode.qrcodeurl);
      startPolling(uuid);
    } catch (error) {
      setError("生成微信二维码失败");
      console.error("生成二维码错误:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = (uuid: string) => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const timestamp = Date.now();
        const response = await axios.get(
          `http://localhost:3000/login/wx/check?timestamp=${timestamp}&uuid=${uuid}`
        );

        const { wx_errcode: status, wx_code } = response.data;
        setScanStatus(status);

        if (status === 405) {
          setWxCode(wx_code);
          handleWeChatLogin(wx_code);
          clearInterval(interval);
        } else if (status === 403 || status === 402) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error("检测扫码状态错误:", error);
      }
    }, 2000);

    setPollingInterval(interval);
  };

  const handleWeChatLogin = async (code: string) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await axios.get(
        `http://localhost:3000/login/openplat?code=${code}`
      );
      console.log("微信登录成功:", response.data);
      const { token, vip_token } = response.data;
      localStorage.setItem("auth_token", token);
      localStorage.setItem("vip_token", vip_token);
      setIsLoggedIn(true);
      setShowLoginBox(false);
    } catch (error) {
      setError("微信登录失败，请重试");
      console.error("微信登录错误:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("vip_token");
    setIsLoggedIn(false);
  };

  const switchLoginType = (type: "mobile" | "wechat") => {
    setLoginType(type);
    setError("");
    if (type === "wechat") {
      generateWeChatQRCode();
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  return (
    <div className="login-container">
      {isLoggedIn ? (
        <button className="logout-button" onClick={handleLogout}>
          退出登录
        </button>
      ) : (
        <button
          className="login-button"
          onClick={(e) => {
            e.stopPropagation();
            setShowLoginBox(true);
          }}
        >
          登录
        </button>
      )}

      {showLoginBox && (
        <div className="login-overlay" onClick={() => setShowLoginBox(false)}>
          <div className="login-box" onClick={(e) => e.stopPropagation()}>
            <div className="login-tabs">
              <button
                className={`tab-button ${loginType === "mobile" ? "active" : ""}`}
                onClick={() => switchLoginType("mobile")}
              >
                手机验证码登录
              </button>
              <button
                className={`tab-button ${loginType === "wechat" ? "active" : ""}`}
                onClick={() => switchLoginType("wechat")}
              >
                微信扫码登录
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {loginType === "mobile" ? (
              <>
                <div className="input-group">
                  <label>手机号:</label>
                  <input
                    type="tel"
                    value={mobile}
                    placeholder="请输入手机号"
                    onChange={(e) => setMobile(e.target.value)}
                    disabled={isCodeSent}
                    maxLength={11}
                  />
                  <button
                    className="send-code-button"
                    onClick={handleSendCode}
                    disabled={isCodeSent || countdown > 0 || isLoading}
                  >
                    {countdown > 0 ? `${countdown}s后重试` : "发送验证码"}
                  </button>
                </div>

                <div className="input-group">
                  <label>验证码:</label>
                  <input
                    type="text"
                    value={code}
                    placeholder="请输入验证码"
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                  />
                </div>

                <button
                  className="login-submit"
                  onClick={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? "登录中..." : "登录"}
                </button>
              </>
            ) : (
              <div className="wechat-login-container">
                {qrCodeBase64 ? (
                  <>
                    <img
                      src={`data:image/png;base64,${qrCodeBase64}`}
                      alt="微信登录二维码"
                      className="qr-code"
                    />
                    <p className="scan-status">
                      {scanStatus === 408 && "等待扫描..."}
                      {scanStatus === 404 && "已扫描，等待确认..."}
                      {scanStatus === 403 && "已拒绝登录"}
                      {scanStatus === 402 && "二维码已过期"}
                      {scanStatus === 0 && "请使用微信扫码登录"}
                      {scanStatus === 405 && "登录成功，正在跳转..."}
                    </p>
                    {scanStatus === 402 && (
                      <button
                        className="refresh-button"
                        onClick={generateWeChatQRCode}
                        disabled={isLoading}
                      >
                        {isLoading ? "正在生成..." : "刷新二维码"}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="loading-qrcode">
                    {isLoading
                      ? "正在生成二维码..."
                      : "点击上方切换按钮生成二维码"}
                  </div>
                )}
                <p className="wechat-tip">
                  打开{" "}
                  <a href={qrCodeLink} target="_blank" rel="noreferrer">
                    微信
                  </a>{" "}
                  扫一扫登录
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
