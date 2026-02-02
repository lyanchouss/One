"use client";

import { useEffect, useRef, useState } from "react";

interface Bubble {
  x: number;
  y: number;
  radius: number;
  highlightX: number;
  highlightY: number;
  highlightSize: number;
  iridescenceOffset: number;
}

export default function BubblesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Установка высокого разрешения
    const dpr = window.devicePixelRatio || 2;
    const width = 2000;
    const height = 2000;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    ctx.scale(dpr, dpr);
    
    // Очистка с прозрачным фоном
    ctx.clearRect(0, 0, width, height);

    // Генерация пузырей разного размера
    const bubbles: Bubble[] = [];
    const sizes = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320];
    
    // Функция проверки перекрытия
    const isOverlapping = (x: number, y: number, radius: number, existingBubbles: Bubble[]) => {
      for (const bubble of existingBubbles) {
        const dx = x - bubble.x;
        const dy = y - bubble.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < radius + bubble.radius + 20) {
          return true;
        }
      }
      return false;
    };
    
    // Создаем 18 пузырей с хаотичным расположением, избегая перекрытий
    let attempts = 0;
    while (bubbles.length < 18 && attempts < 500) {
      attempts++;
      const radius = sizes[Math.floor(Math.random() * sizes.length)];
      const x = radius + Math.random() * (width - radius * 2);
      const y = radius + Math.random() * (height - radius * 2);
      
      if (!isOverlapping(x, y, radius, bubbles)) {
        // Позиция блика (в верхней левой части)
        const highlightX = x - radius * 0.3;
        const highlightY = y - radius * 0.3;
        const highlightSize = radius * 0.4;
        
        bubbles.push({
          x,
          y,
          radius,
          highlightX,
          highlightY,
          highlightSize,
          iridescenceOffset: Math.random() * Math.PI * 2,
        });
      }
    }

    // Функция для создания градиента радужного перелива
    const createIridescentGradient = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      offset: number
    ) => {
      const gradient = ctx.createRadialGradient(x, y, radius * 0.7, x, y, radius);
      
      // Пастельные радужные цвета
      const colors = [
        { stop: 0, color: `rgba(255, 200, 220, 0.15)` }, // Розовый
        { stop: 0.2, color: `rgba(200, 220, 255, 0.2)` }, // Голубой
        { stop: 0.4, color: `rgba(255, 240, 200, 0.15)` }, // Жёлтый
        { stop: 0.6, color: `rgba(220, 200, 255, 0.2)` }, // Сиреневый
        { stop: 0.8, color: `rgba(255, 200, 220, 0.15)` }, // Розовый
        { stop: 1, color: `rgba(255, 255, 255, 0.05)` }, // Белый
      ];
      
      colors.forEach(({ stop, color }) => {
        gradient.addColorStop(stop, color);
      });
      
      return gradient;
    };

    // Рисуем каждый пузырь
    bubbles.forEach((bubble) => {
      const { x, y, radius, highlightX, highlightY, highlightSize, iridescenceOffset } = bubble;

      // Основной круг пузыря с объёмным эффектом
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      
      // Базовый градиент с объёмом (90% непрозрачности)
      const baseGradient = ctx.createRadialGradient(
        x - radius * 0.4,
        y - radius * 0.4,
        radius * 0.1,
        x,
        y,
        radius
      );
      baseGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      baseGradient.addColorStop(0.15, "rgba(255, 255, 255, 0.85)");
      baseGradient.addColorStop(0.3, "rgba(250, 255, 255, 0.75)");
      baseGradient.addColorStop(0.5, "rgba(240, 250, 255, 0.65)");
      baseGradient.addColorStop(0.7, "rgba(230, 240, 255, 0.55)");
      baseGradient.addColorStop(0.85, "rgba(220, 235, 250, 0.45)");
      baseGradient.addColorStop(1, "rgba(200, 220, 240, 0.35)");
      
      ctx.fillStyle = baseGradient;
      ctx.fill();
      
      // Дополнительный объёмный слой для глубины (верхняя часть)
      const volumeGradientTop = ctx.createRadialGradient(
        x - radius * 0.25,
        y - radius * 0.25,
        0,
        x - radius * 0.25,
        y - radius * 0.25,
        radius * 0.6
      );
      volumeGradientTop.addColorStop(0, "rgba(255, 255, 255, 0.4)");
      volumeGradientTop.addColorStop(0.5, "rgba(250, 255, 255, 0.2)");
      volumeGradientTop.addColorStop(1, "transparent");
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = volumeGradientTop;
      ctx.fill();
      
      // Дополнительный объёмный слой для глубины (нижняя часть)
      const volumeGradientBottom = ctx.createRadialGradient(
        x + radius * 0.25,
        y + radius * 0.25,
        0,
        x + radius * 0.25,
        y + radius * 0.25,
        radius * 0.8
      );
      volumeGradientBottom.addColorStop(0, "rgba(180, 200, 220, 0.25)");
      volumeGradientBottom.addColorStop(0.4, "rgba(200, 220, 240, 0.15)");
      volumeGradientBottom.addColorStop(0.7, "rgba(210, 230, 245, 0.08)");
      volumeGradientBottom.addColorStop(1, "transparent");
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = volumeGradientBottom;
      ctx.fill();
      
      // Средний объёмный слой для контраста
      const volumeGradientMiddle = ctx.createRadialGradient(
        x + radius * 0.15,
        y + radius * 0.15,
        0,
        x + radius * 0.15,
        y + radius * 0.15,
        radius * 0.7
      );
      volumeGradientMiddle.addColorStop(0, "rgba(190, 210, 230, 0.2)");
      volumeGradientMiddle.addColorStop(0.6, "rgba(200, 220, 240, 0.1)");
      volumeGradientMiddle.addColorStop(1, "transparent");
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = volumeGradientMiddle;
      ctx.fill();

      // Радужный перламутровый перелив по краям (более выраженный)
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      
      // Создаем несколько слоёв радужного перелива по краям (90% непрозрачности)
      const iridescentColors = [
        { color: "rgba(255, 200, 220, 0.72)", angle: 0 }, // Розовый
        { color: "rgba(200, 220, 255, 0.72)", angle: Math.PI * 0.4 }, // Голубой
        { color: "rgba(255, 240, 200, 0.63)", angle: Math.PI * 0.8 }, // Жёлтый
        { color: "rgba(220, 200, 255, 0.72)", angle: Math.PI * 1.2 }, // Сиреневый
        { color: "rgba(255, 200, 220, 0.63)", angle: Math.PI * 1.6 }, // Розовый
      ];
      
      iridescentColors.forEach(({ color, angle }) => {
        const finalAngle = iridescenceOffset + angle;
        const iridescentX = x + Math.cos(finalAngle) * radius * 0.92;
        const iridescentY = y + Math.sin(finalAngle) * radius * 0.92;
        
        const iridescentGradient = ctx.createRadialGradient(
          iridescentX,
          iridescentY,
          0,
          iridescentX,
          iridescentY,
          radius * 0.5
        );
        
        iridescentGradient.addColorStop(0, color);
        iridescentGradient.addColorStop(0.5, color.replace("0.72", "0.45").replace("0.63", "0.4"));
        iridescentGradient.addColorStop(0.8, color.replace("0.72", "0.25").replace("0.63", "0.2"));
        iridescentGradient.addColorStop(1, "transparent");
        
        ctx.fillStyle = iridescentGradient;
        ctx.fill();
      });
      
      // Дополнительные радужные пятна по краю для перламутрового эффекта
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + iridescenceOffset;
        const edgeX = x + Math.cos(angle) * radius * 0.95;
        const edgeY = y + Math.sin(angle) * radius * 0.95;
        
        const edgeGradient = ctx.createRadialGradient(
          edgeX,
          edgeY,
          0,
          edgeX,
          edgeY,
          radius * 0.3
        );
        
        // Пастельные цвета в зависимости от угла
        const hue = (i / 6) * 360;
        let r, g, b;
        if (hue < 60 || hue > 300) {
          r = 255; g = 200; b = 220; // Розовый
        } else if (hue < 180) {
          r = 200; g = 220; b = 255; // Голубой
        } else if (hue < 240) {
          r = 220; g = 200; b = 255; // Сиреневый
        } else {
          r = 255; g = 240; b = 200; // Жёлтый
        }
        
        edgeGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.54)`);
        edgeGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.27)`);
        edgeGradient.addColorStop(1, "transparent");
        
        ctx.fillStyle = edgeGradient;
        ctx.fill();
      }
      
      ctx.restore();

      // Тонкая обводка для стеклянного эффекта (90% непрозрачности)
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Внутренняя обводка для глубины и объёма
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.98, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200, 220, 255, 0.36)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Дополнительная обводка для объёма (средняя)
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.96, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(180, 210, 240, 0.27)";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Дополнительная тёмная обводка снизу для объёма
      ctx.beginPath();
      ctx.arc(x, y + radius * 0.1, radius * 0.95, Math.PI * 0.3, Math.PI * 0.7);
      ctx.strokeStyle = "rgba(150, 180, 220, 0.27)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Основной блик (большой, мягкий, объёмный, 90% непрозрачности)
      ctx.beginPath();
      ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2);
      const highlightGradient = ctx.createRadialGradient(
        highlightX,
        highlightY,
        0,
        highlightX,
        highlightY,
        highlightSize
      );
      highlightGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      highlightGradient.addColorStop(0.2, "rgba(255, 255, 255, 0.95)");
      highlightGradient.addColorStop(0.4, "rgba(255, 255, 255, 0.85)");
      highlightGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.65)");
      highlightGradient.addColorStop(0.8, "rgba(255, 255, 255, 0.4)");
      highlightGradient.addColorStop(1, "transparent");
      ctx.fillStyle = highlightGradient;
      ctx.fill();

      // Вторичный блик (маленький, яркий, для объёма)
      const smallHighlightX = highlightX - highlightSize * 0.25;
      const smallHighlightY = highlightY - highlightSize * 0.25;
      const smallHighlightSize = highlightSize * 0.4;
      
      ctx.beginPath();
      ctx.arc(smallHighlightX, smallHighlightY, smallHighlightSize, 0, Math.PI * 2);
      const smallHighlightGradient = ctx.createRadialGradient(
        smallHighlightX,
        smallHighlightY,
        0,
        smallHighlightX,
        smallHighlightY,
        smallHighlightSize
      );
      smallHighlightGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      smallHighlightGradient.addColorStop(0.3, "rgba(255, 255, 255, 0.9)");
      smallHighlightGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.7)");
      smallHighlightGradient.addColorStop(0.8, "rgba(255, 255, 255, 0.45)");
      smallHighlightGradient.addColorStop(1, "transparent");
      ctx.fillStyle = smallHighlightGradient;
      ctx.fill();
      
      // Третичный блик для дополнительного объёма
      const tertiaryHighlightX = highlightX - highlightSize * 0.15;
      const tertiaryHighlightY = highlightY - highlightSize * 0.15;
      const tertiaryHighlightSize = highlightSize * 0.2;
      
      ctx.beginPath();
      ctx.arc(tertiaryHighlightX, tertiaryHighlightY, tertiaryHighlightSize, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.fill();
      
      // Четвёртый блик для максимального объёма
      const fourthHighlightX = highlightX - highlightSize * 0.1;
      const fourthHighlightY = highlightY - highlightSize * 0.1;
      const fourthHighlightSize = highlightSize * 0.1;
      
      ctx.beginPath();
      ctx.arc(fourthHighlightX, fourthHighlightY, fourthHighlightSize, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.fill();

      // Отражение света снизу (мягкое, для объёма, 90% непрозрачности)
      ctx.beginPath();
      ctx.arc(x, y + radius * 0.4, radius * 0.6, 0, Math.PI * 2);
      const reflectionGradient = ctx.createRadialGradient(
        x,
        y + radius * 0.4,
        0,
        x,
        y + radius * 0.4,
        radius * 0.6
      );
      reflectionGradient.addColorStop(0, "rgba(240, 250, 255, 0.36)");
      reflectionGradient.addColorStop(0.4, "rgba(240, 250, 255, 0.27)");
      reflectionGradient.addColorStop(0.7, "rgba(240, 250, 255, 0.18)");
      reflectionGradient.addColorStop(1, "transparent");
      ctx.fillStyle = reflectionGradient;
      ctx.fill();
      
      // Дополнительное отражение для объёма (боковое)
      ctx.beginPath();
      ctx.arc(x + radius * 0.3, y + radius * 0.2, radius * 0.5, 0, Math.PI * 2);
      const sideReflectionGradient = ctx.createRadialGradient(
        x + radius * 0.3,
        y + radius * 0.2,
        0,
        x + radius * 0.3,
        y + radius * 0.2,
        radius * 0.5
      );
      sideReflectionGradient.addColorStop(0, "rgba(230, 245, 255, 0.27)");
      sideReflectionGradient.addColorStop(0.6, "rgba(235, 248, 255, 0.13)");
      sideReflectionGradient.addColorStop(1, "transparent");
      ctx.fillStyle = sideReflectionGradient;
      ctx.fill();

      // Дополнительные мелкие блики для реалистичности и объёма (90% непрозрачности)
      for (let i = 0; i < 4; i++) {
        const sparkleX = x + (Math.random() - 0.5) * radius * 0.8;
        const sparkleY = y + (Math.random() - 0.5) * radius * 0.8;
        const sparkleSize = radius * 0.07;
        
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.72 + Math.random() * 0.27})`;
        ctx.fill();
      }
      
      // Дополнительный объёмный слой с контрастом
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      
      const contrastGradient = ctx.createLinearGradient(
        x - radius,
        y - radius,
        x + radius,
        y + radius
      );
      contrastGradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      contrastGradient.addColorStop(0.5, "transparent");
      contrastGradient.addColorStop(1, "rgba(180, 200, 220, 0.18)");
      
      ctx.fillStyle = contrastGradient;
      ctx.fill();
      ctx.restore();
    });

    setIsReady(true);
  }, []);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "soap-bubbles.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ backgroundColor: '#FAF0E6' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-4xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center" style={{ color: '#8B7355' }}>
          Мыльные пузыри
        </h1>
        
        <div className="flex justify-center mb-6">
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-lg"
            style={{ maxWidth: "100%", height: "auto", border: "2px solid #E8D5C4" }}
          />
        </div>
        
        <div className="flex justify-center gap-4">
          <button
            onClick={handleDownload}
            disabled={!isReady}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
          >
            {isReady ? "Скачать PNG" : "Генерация..."}
          </button>
        </div>
        
        <p className="text-sm text-center mt-4" style={{ color: '#B89B7A' }}>
          Разрешение: 2000×2000px (с учётом pixel ratio)
        </p>
      </div>
    </div>
  );
}

