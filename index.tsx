
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera as CameraIcon, RefreshCw, Hand, MousePointer2, Loader2, Sparkles, GlassWater, CheckCircle2, Droplets, ArrowRight, AlertCircle } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---

type GameState = 'intro' | 'stacked' | 'shuffling' | 'selecting' | 'revealing' | 'color_selection' | 'filling_glass' | 'brewing' | 'result';
type HandGesture = 'none' | 'fist' | 'open' | 'point' | 'shake' | 'pinch';
type ControlMode = 'hand' | 'mouse';

type CardData = {
  id: number;
  rotation: number;
  shuffleOffset: { x: number, y: number, r: number };
  image: string;
  palette: string[]; 
};

type CocktailData = {
  name: string;
  nameEn: string;
  description: string;
  colors: string[];
};

// --- Constants ---
const TOTAL_CARDS = 88;
const SELECTION_LIMIT = 3;
const HOVER_THRESHOLD_MS = 1800;
const POUR_DURATION_MS = 1500;

const OH_CARD_IMAGES = [
  ...Array.from({ length: 48 }, (_, i) => 
    `https://raw.githubusercontent.com/rikusdb0531-collab/ohcards/60d8af9ed509f8b3da461dd072d582c4e2b71587/${i + 1}.jpg`
  ),
  ...Array.from({ length: 40 }, (_, i) => 
    `https://raw.githubusercontent.com/rikusdb0531-collab/ohcards/c1eaacbef7467bd9386ce877bb0920a9b18af710/${i + 49}.jpg`
  )
];

const CARD_BACK_GRADIENT = "linear-gradient(135deg, #f8f6f9 0%, #ece7f0 100%)";

// --- Components ---

const WatercolorCocktail = ({ colors }: { colors: string[] }) => {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-8 bg-[#fdfdfb] overflow-hidden rounded-[20px]">
      <svg className="absolute inset-0 pointer-events-none opacity-20" width="100%" height="100%">
        <filter id="paperTexture">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
          <feDiffuseLighting in="noise" lightingColor="#fff" surfaceScale="2">
            <feDistantLight azimuth="45" elevation="60" />
          </feDiffuseLighting>
        </filter>
        <rect width="100%" height="100%" filter="url(#paperTexture)" />
      </svg>

      <svg viewBox="0 0 200 300" className="w-full max-w-[280px] h-auto filter drop-shadow-xl overflow-visible">
        <defs>
          <filter id="watercolorFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" seed="5" />
            <feDisplacementMap in="SourceGraphic" scale="15" />
          </filter>
          <linearGradient id="liquidGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={colors[0] || '#ffffff'} />
            <stop offset="40%" stopColor={colors[1] || '#ffffff'} />
            <stop offset="80%" stopColor={colors[2] || '#ffffff'} />
          </linearGradient>
        </defs>
        <path d="M40,50 L160,50 L140,260 Q140,280 100,280 Q60,280 60,260 Z" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="5,2" />
        <g filter="url(#watercolorFilter)">
          <path d="M45,60 L155,60 L138,255 Q138,275 100,275 Q62,275 62,255 Z" fill="url(#liquidGrad)" opacity="0.6" />
          <path d="M50,70 L150,70 L135,250 Q135,270 100,270 Q65,270 65,250 Z" fill="url(#liquidGrad)" opacity="0.3" transform="translate(2, 3)" />
        </g>
        <ellipse cx="100" cy="50" rx="60" ry="8" fill="none" stroke="#cbd5e1" strokeWidth="1" />
        <circle cx="160" cy="80" r="12" fill={colors[2] || '#ffffff'} opacity="0.1" filter="url(#watercolorFilter)" />
        <circle cx="30" cy="220" r="8" fill={colors[0] || '#ffffff'} opacity="0.15" filter="url(#watercolorFilter)" />
      </svg>
      <div className="absolute inset-0 border-[20px] border-white pointer-events-none"></div>
    </div>
  );
};

// --- Helpers ---

const extractPaletteFromImage = async (imgUrl: string): Promise<string[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(['#E0C3FC', '#8EC5FC', '#F093FB']);
        canvas.width = 50; canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        const pixels = ctx.getImageData(0, 0, 50, 50).data;
        const colorCounts: { [key: string]: number } = {};
        for (let i = 0; i < pixels.length; i += 16) { 
          const r = pixels[i]; const g = pixels[i+1]; const b = pixels[i+2];
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 30 || brightness > 235) continue;
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }
        let sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
        if (sorted.length < 3) return resolve(['#E0C3FC', '#8EC5FC', '#F093FB']);
        const result: string[] = [sorted[0][0]];
        for (let i = 1; i < sorted.length && result.length < 3; i++) {
            const currentHex = sorted[i][0];
            const isDifferentEnough = result.every(existing => {
               const r1 = parseInt(existing.slice(1,3), 16); const g1 = parseInt(existing.slice(3,5), 16); const b1 = parseInt(existing.slice(5,7), 16);
               const r2 = parseInt(currentHex.slice(1,3), 16); const g2 = parseInt(currentHex.slice(3,5), 16); const b2 = parseInt(currentHex.slice(5,7), 16);
               return Math.abs(r1-r2) + Math.abs(g1-g2) + Math.abs(b1-b2) > 100;
            });
            if (isDifferentEnough) result.push(currentHex);
        }
        while (result.length < 3) result.push(sorted[1]?.[0] || '#ffffff');
        resolve(result);
      } catch (e) { resolve(['#E0C3FC', '#8EC5FC', '#F093FB']); }
    };
    img.onerror = () => resolve(['#E0C3FC', '#8EC5FC', '#F093FB']);
  });
};

const generateCards = (): CardData[] => {
  return Array.from({ length: TOTAL_CARDS }).map((_, i) => ({
    id: i,
    rotation: (Math.random() - 0.5) * 12,
    shuffleOffset: {
       x: (Math.random() - 0.5) * window.innerWidth * 0.8,
       y: (Math.random() - 0.5) * window.innerHeight * 0.7,
       r: (Math.random() - 0.5) * 360
    },
    image: OH_CARD_IMAGES[i] || OH_CARD_IMAGES[0],
    palette: [] 
  }));
};

const HandController = ({ enabled, onGestureChange, onCursorUpdate }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastGesture = useRef<HandGesture>('none');
  const shakeHistory = useRef<{x: number, time: number}[]>([]);

  // Comprehensive check for MediaPipe constructors
  const getConstructors = () => {
    const win = window as any;
    const Hands = win.Hands?.Hands || win.Hands;
    const Camera = win.Camera?.Camera || win.Camera;
    return { 
      Hands: typeof Hands === 'function' ? Hands : null,
      Camera: typeof Camera === 'function' ? Camera : null
    };
  };

  useEffect(() => {
    if (!enabled) return;

    let checkCount = 0;
    const timer = setInterval(() => {
      const { Hands, Camera } = getConstructors();
      if (Hands && Camera) {
        setLibsLoaded(true);
        clearInterval(timer);
      }
      checkCount++;
      if (checkCount > 30) { // 15 seconds timeout
        setLoadError(true);
        clearInterval(timer);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !libsLoaded || !videoRef.current || !canvasRef.current) return;

    const win = window as any;
    const { Hands: HandsConstructor, Camera: CameraConstructor } = getConstructors();
    if (!HandsConstructor || !CameraConstructor) return;

    let hands: any = null;
    let camera: any = null;

    try {
      hands = new HandsConstructor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      
      hands.setOptions({ 
        maxNumHands: 1, 
        modelComplexity: 1, 
        minDetectionConfidence: 0.55, 
        minTrackingConfidence: 0.55 
      });
      
      hands.onResults((results: any) => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        
        if (win.drawConnectors && win.drawLandmarks && results.multiHandLandmarks) {
          for (const landmarks of results.multiHandLandmarks) {
            win.drawConnectors(ctx, landmarks, win.HAND_CONNECTIONS, {color: '#6366f1', lineWidth: 2});
            win.drawLandmarks(ctx, landmarks, {color: '#ffffff', lineWidth: 1, radius: 2});
          }
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];
          const indexTip = landmarks[8]; 
          const thumbTip = landmarks[4];
          const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
          const isIndexExtended = landmarks[8].y < landmarks[6].y;
          const isMiddleExtended = landmarks[12].y < landmarks[10].y;
          const extendedCount = [isIndexExtended, isMiddleExtended].filter(Boolean).length;
          
          let detectedGesture: HandGesture = 'none';
          if (pinchDist < 0.05) detectedGesture = 'pinch';
          else if (extendedCount === 0) detectedGesture = 'fist';
          else if (extendedCount >= 2) detectedGesture = 'open';
          else if (isIndexExtended) detectedGesture = 'point';
          
          if (isIndexExtended) {
             const tipX = landmarks[8].x; const now = Date.now();
             shakeHistory.current.push({ x: tipX, time: now });
             shakeHistory.current = shakeHistory.current.filter(p => now - p.time < 500);
             if (shakeHistory.current.length > 12) {
               const xs = shakeHistory.current.map(p => p.x); 
               const range = Math.max(...xs) - Math.min(...xs);
               if (range > 0.18) detectedGesture = 'shake';
             }
          }
          
          const cursorX = (1 - indexTip.x) * window.innerWidth;
          const cursorY = indexTip.y * window.innerHeight;
          onCursorUpdate(cursorX, cursorY);
          
          if (detectedGesture !== lastGesture.current) { 
            lastGesture.current = detectedGesture; 
            onGestureChange(detectedGesture); 
          }
        }
        ctx.restore();
      });

      camera = new CameraConstructor(videoRef.current, {
        onFrame: async () => { 
          if (videoRef.current) { 
            try { await hands.send({ image: videoRef.current }); } catch(e) {} 
          } 
        },
        width: 640,
        height: 480,
      });

      camera.start().then(() => setCameraReady(true)).catch(() => setCameraReady(false));

    } catch (err) {
      console.error("Initialization failed:", err);
      setLoadError(true);
    }

    return () => { 
      if (camera) camera.stop();
      setCameraReady(false); 
    };
  }, [enabled, libsLoaded]);

  if (!enabled) return null;
  
  return (
    <div className="fixed top-6 right-6 w-56 h-40 bg-slate-900 rounded-3xl overflow-hidden border border-white/20 z-[9999] shadow-2xl">
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted autoPlay />
      <canvas ref={canvasRef} width={640} height={480} className="w-full h-full object-cover" style={{ opacity: cameraReady ? 1 : 0 }} />
      
      {(!libsLoaded || !cameraReady || loadError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white text-[10px] uppercase tracking-widest text-center px-4">
          {loadError ? (
            <>
              <AlertCircle className="mb-2 w-5 h-5 text-rose-500" />
              <span className="text-rose-400">VISION FAILED</span>
              <span className="mt-1 text-[8px] text-slate-500">PLEASE USE MOUSE MODE</span>
            </>
          ) : (
            <>
              <Loader2 className="animate-spin mb-3 w-5 h-5 text-indigo-400" />
              <span>{!libsLoaded ? 'PREPARING VISION' : 'CALIBRATING LENS'}</span>
            </>
          )}
        </div>
      )}

      {cameraReady && !loadError && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-[7px] text-white/80 tracking-widest font-bold uppercase">SENSING</span>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [controlMode, setControlMode] = useState<ControlMode>('hand');
  const [gameState, setGameState] = useState<GameState>('intro');
  const [cards, setCards] = useState<CardData[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [time, setTime] = useState(0);
  const [gesture, setGesture] = useState<HandGesture>('none');
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [smoothCursor, setSmoothCursor] = useState({ x: 0, y: 0 });
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);
  const hoverStartTime = useRef<number>(0);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [pouredColors, setPouredColors] = useState<string[]>([]);
  const [pouredIndices, setPouredIndices] = useState<number[]>([]); 
  const [cocktail, setCocktail] = useState<CocktailData | null>(null);
  const [isPouring, setIsPouring] = useState(false);
  const [currentlyPouringIdx, setCurrentlyPouringIdx] = useState<number | null>(null);

  useEffect(() => { setCards(generateCards()); }, []);

  const handleBrewing = async (finalColors: string[]) => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
          const textResponse = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `Subconscious exploration task. The user selected these 3 soul colors: ${finalColors.join(', ')}. Please generate: 1. A poetic and unique Chinese name (4-5 chars). 2. A matching English name. 3. A supportive, therapeutic Chinese interpretation (35 words) explaining how these colors represent the user's past experiences, present state, and future spiritual path. Output in JSON.`,
              config: { 
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    nameEn: { type: Type.STRING },
                    description: { type: Type.STRING }
                  },
                  required: ['name', 'nameEn', 'description']
                }
              }
          });
          
          const meta = JSON.parse(textResponse.text || '{}');
          setCocktail({
              name: meta.name || "极光之愈",
              nameEn: meta.nameEn || "Aurora Healing",
              description: meta.description || "在色彩的流转中，我们听见内心的声音。虽然外在形式会改变，但这份觉察的力量将始终陪伴着您。",
              colors: [...finalColors]
          });
          setGameState('result');
      } catch (e: any) {
          console.error("Gemini Error:", e);
          setCocktail({
              name: "心灵回响",
              nameEn: "Soul Echo",
              description: "在色彩的流转中，我们听见内心的声音。愿这份宁静的色彩为您带来内在的安宁与前行的力量。",
              colors: [...finalColors]
          });
          setGameState('result');
      }
  };

  const resetGame = () => {
    setGameState('intro'); setSelectedIndices([]); setRevealed(false); setSelectedColors([]); setPouredColors([]); setPouredIndices([]);
    setCocktail(null); setIsPouring(false); setCurrentlyPouringIdx(null); setHoveredCardId(null); setHoverProgress(0);
    setCards(generateCards());
  };

  useEffect(() => {
    let raf: number; const lerp = (s: number, e: number, f: number) => s + (e - s) * f;
    const update = () => { setSmoothCursor(prev => ({ x: lerp(prev.x, cursor.x, 0.25), y: lerp(prev.y, cursor.y, 0.25) })); raf = requestAnimationFrame(update); };
    raf = requestAnimationFrame(update); return () => cancelAnimationFrame(raf);
  }, [cursor]);

  useEffect(() => {
    if (controlMode === 'mouse') {
      const handleMouseMove = (e: MouseEvent) => setCursor({ x: e.clientX, y: e.clientY });
      window.addEventListener('mousemove', handleMouseMove); return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [controlMode]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      const now = Date.now(); setTime(now);
      if (gameState === 'stacked' && controlMode === 'hand' && gesture === 'open') setGameState('shuffling');
      if (gameState === 'shuffling' && controlMode === 'hand' && gesture === 'point') setGameState('selecting');
      if (gameState === 'selecting') {
         if (selectedIndices.length >= SELECTION_LIMIT) { if (!hoveredCardId) setGameState('revealing'); }
         else {
             const element = document.elementFromPoint(cursor.x, cursor.y); const cardEl = element?.closest('[data-card-id]');
             let targetId = cardEl ? parseInt(cardEl.getAttribute('data-card-id') || '-1') : -1;
             if (selectedIndices.includes(targetId)) targetId = -1;
             if (targetId !== -1) {
                 if (hoveredCardId !== targetId) { setHoveredCardId(targetId); hoverStartTime.current = now; setHoverProgress(0); }
                 else if (controlMode === 'hand') {
                     const elapsed = now - hoverStartTime.current; const progress = Math.min(elapsed / HOVER_THRESHOLD_MS, 1); setHoverProgress(progress);
                     if (elapsed > HOVER_THRESHOLD_MS) { setSelectedIndices(prev => prev.includes(targetId) ? prev : [...prev, targetId]); setHoveredCardId(null); setHoverProgress(0); }
                 }
             } else { setHoveredCardId(null); setHoverProgress(0); }
         }
      }
      if (gameState === 'revealing' && !revealed) { if ((controlMode === 'hand' && (gesture === 'shake' || gesture === 'open'))) revealAndExtract(); }
      if (gameState === 'color_selection') {
          const element = document.elementFromPoint(cursor.x, cursor.y); const bubble = element?.closest('[data-bubble-color]');
          if (bubble) {
              const color = bubble.getAttribute('data-bubble-color'); const cardIdx = parseInt(bubble.getAttribute('data-card-order') || '0');
              if (color && (gesture === 'pinch' || (controlMode === 'mouse' && gesture === 'point'))) {
                  setSelectedColors(prev => { const next = [...prev]; next[cardIdx] = color; return next; });
              }
          }
          if (selectedColors.filter(Boolean).length === 3) setTimeout(() => setGameState('filling_glass'), 1500);
      }
      if (gameState === 'filling_glass') {
          const element = document.elementFromPoint(cursor.x, cursor.y); const bubble = element?.closest('[data-pour-source-idx]');
          if (bubble) {
              const idx = parseInt(bubble.getAttribute('data-pour-source-idx') || '-1'); 
              const color = selectedColors[idx];
              if (idx !== -1 && !pouredIndices.includes(idx)) {
                  if (currentlyPouringIdx !== idx) { setCurrentlyPouringIdx(idx); hoverStartTime.current = now; setHoverProgress(0); }
                  else { setIsPouring(true); const elapsed = now - hoverStartTime.current; const progress = Math.min(elapsed / POUR_DURATION_MS, 1); setHoverProgress(progress);
                      if (elapsed > POUR_DURATION_MS) { 
                          const nextPouredColors = [...pouredColors, color];
                          setPouredColors(nextPouredColors);
                          const nextPouredIndices = [...pouredIndices, idx];
                          setPouredIndices(nextPouredIndices);
                          setIsPouring(false); setCurrentlyPouringIdx(null); setHoverProgress(0); 
                          if (nextPouredColors.length === 3) {
                              setGameState('brewing');
                              handleBrewing(nextPouredColors);
                          }
                      }
                  }
              } else { setIsPouring(false); setCurrentlyPouringIdx(null); setHoverProgress(0); }
          } else { setIsPouring(false); setCurrentlyPouringIdx(null); setHoverProgress(0); }
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop); return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, gesture, cursor, selectedIndices, hoveredCardId, controlMode, revealed, selectedColors, pouredColors, pouredIndices, currentlyPouringIdx]);

  const revealAndExtract = async () => {
      setRevealed(true); const updatedCards = [...cards];
      const palettes = await Promise.all(selectedIndices.map(idx => extractPaletteFromImage(updatedCards[idx].image)));
      selectedIndices.forEach((idx, i) => { updatedCards[idx].palette = palettes[i]; });
      setCards(updatedCards); setTimeout(() => setGameState('color_selection'), 1500);
  };

  const handleStageClick = () => {
      if (controlMode !== 'mouse') return;
      if (gameState === 'intro') setGameState('stacked');
      else if (gameState === 'stacked') setGameState('shuffling');
      else if (gameState === 'shuffling') setGameState('selecting');
      else if (gameState === 'selecting' && hoveredCardId !== null && !selectedIndices.includes(hoveredCardId)) {
          setSelectedIndices(prev => [...prev, hoveredCardId]); setHoveredCardId(null); setHoverProgress(0);
      } else if (gameState === 'revealing') revealAndExtract();
  };

  const getCardStyle = (index: number) => {
      const isSelected = selectedIndices.includes(index);
      const selectionOrder = selectedIndices.indexOf(index);
      const isHovered = hoveredCardId === index;
      const defaultBezier = "cubic-bezier(0.25, 1, 0.5, 1)";
      if (gameState === 'intro') {
          const { x, y, r } = cards[index].shuffleOffset;
          return { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${r}deg) scale(0.65)`, left: '50%', top: '50%', zIndex: index, opacity: 0.15, transition: `transform 2.5s ${defaultBezier}, opacity 2s ease` };
      }
      if (gameState === 'stacked') return { transform: `translate(-50%, -50%) rotate(${cards[index].rotation}deg) scale(0.85)`, left: '50%', top: '60%', zIndex: index, opacity: 1, transition: `transform 1.6s ${defaultBezier}, opacity 1s ease` };
      if (gameState === 'shuffling') {
          const seed = index * 200; const floatX = Math.sin((time + seed) / 700) * 120; const floatY = Math.cos((time + seed) / 900) * 120; const rot = Math.sin((time + seed) / 1100) * 360;
          return { transform: `translate(calc(-50% + ${floatX}px), calc(-50% + ${floatY}px)) rotate(${rot}deg) scale(0.8)`, left: '50%', top: '50%', zIndex: index, opacity: 0.85, transition: 'transform 1s linear' };
      }
      if (isSelected) {
          if (gameState === 'filling_glass' || gameState === 'brewing' || gameState === 'result') return { transform: `translate(0, 0) scale(0.55)`, left: '80px', top: `${100 + selectionOrder * 160}px`, zIndex: 1000, opacity: 0.9, transition: `all 1.5s ${defaultBezier}` };
          if (gameState === 'revealing' || gameState === 'color_selection') {
              const centerOffset = (selectionOrder - 1) * 360; 
              const cardScale = 1.6;
              return { transform: `translate(calc(-50% + ${centerOffset}px), -50%) scale(${cardScale})`, left: '50%', top: '48%', zIndex: 1000 + selectionOrder, opacity: 1, transition: `transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 1s ease` };
          } else {
              const slotOffset = (selectionOrder - 1) * 150; 
              return { transform: `translate(calc(-50% + ${slotOffset}px), -50%) scale(0.95)`, left: '50%', top: '80%', zIndex: 500 + selectionOrder, opacity: 1, transition: `transform 1s ${defaultBezier}` };
          }
      }
      if (gameState === 'selecting' || gameState === 'revealing') {
          const totalWidth = window.innerWidth * 0.92; const spacing = totalWidth / TOTAL_CARDS; const finalX = (window.innerWidth - totalWidth) / 2 + index * spacing;
          const mid = TOTAL_CARDS / 2; const curveFactor = Math.pow((index - mid) / mid, 2); const finalY = 260 + curveFactor * 70; const finalRot = (index - mid) * 1.8;
          const scale = isHovered ? 1.65 : 0.85; const hoverY = isHovered ? -70 : 0;
          return { transform: `translate(${finalX - window.innerWidth/2}px, ${finalY + hoverY - window.innerHeight/2}px) rotate(${finalRot}deg) scale(${scale})`, left: '50%', top: '50%', zIndex: isHovered ? 2000 : index, opacity: isSelected ? 0 : 1, transition: `transform 0.7s ${defaultBezier}` };
      }
      return { display: 'none' };
  };

  return (
    <div className="relative w-full h-screen bg-[#fdfdfb] overflow-hidden select-none cursor-default font-display" onClick={handleStageClick}>
      <HandController enabled={controlMode === 'hand'} onGestureChange={setGesture} onCursorUpdate={(x:any,y:any) => setCursor({x,y})} />
      
      <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-[-10%] left-[-15%] w-[50%] h-[50%] rounded-full bg-indigo-50/50 blur-[150px]"></div>
          <div className="absolute bottom-[-10%] right-[-15%] w-[50%] h-[50%] rounded-full bg-rose-50/50 blur-[150px]"></div>
      </div>

      <div className={`absolute top-12 left-0 right-0 z-50 text-center transition-all duration-1000 ${gameState === 'brewing' || gameState === 'result' ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
          <div className="inline-block px-8 py-2 mb-4 border-b border-slate-100">
             <h1 className="text-5xl text-slate-800 tracking-[0.4em] font-light">OH CARDS</h1>
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.7em]">静心疗愈 • 探索内在潜意识</p>
      </div>

      <div className={`absolute top-48 left-0 right-0 z-50 flex justify-center pointer-events-none transition-all duration-1000 ${['brewing', 'result', 'intro'].includes(gameState) ? 'opacity-0' : 'opacity-100'}`}>
          <div className="px-12 py-4 bg-white/40 backdrop-blur-3xl rounded-full border border-white/60 shadow-2xl text-slate-500 text-[11px] uppercase tracking-[0.25em] z-[70]">
             {gameState === 'stacked' && "握紧拳头，然后缓缓张开以开始感应"}
             {gameState === 'shuffling' && "伸出食指指向牌堆，捕捉那一瞬间的灵感"}
             {gameState === 'selecting' && `选择还需 ${SELECTION_LIMIT - selectedIndices.length} 张卡牌`}
             {gameState === 'revealing' && "轻轻摇晃，揭开未知的奥秘"}
             {gameState === 'color_selection' && (selectedColors.filter(Boolean).length < 3 ? "提取卡牌中的灵魂色彩能量" : "灵魂色彩已就位")}
             {gameState === 'filling_glass' && `将选中的色彩注入感应杯 (${pouredColors.length}/3)`}
          </div>
      </div>

      {gameState === 'intro' && (
         <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-white/20 backdrop-blur-sm animate-fade-in">
             <div className="mb-12 text-center space-y-4 max-w-xl">
                 <p className="text-slate-400 text-xs tracking-[0.8em] uppercase">Mindful Alchemy</p>
                 <p className="text-slate-500 leading-relaxed font-light text-sm px-10">
                    欢迎开启 OH Cards 潜意识探索之旅。在这里，88张卡牌将作为您心灵的镜子，映照出深藏于心的智慧，并提炼成一杯独一无二的治愈能量。
                 </p>
             </div>
             <button onClick={(e) => { e.stopPropagation(); setGameState('stacked'); }}
                className="group relative px-16 py-7 bg-white shadow-2xl rounded-full transition-all duration-700 hover:scale-105 active:scale-95 border border-slate-100">
                 <div className="relative flex items-center gap-4">
                    <span className="text-lg text-slate-800 tracking-[0.6em]">开始探索</span>
                    <ArrowRight className="w-5 h-5 text-indigo-400" />
                 </div>
             </button>
         </div>
      )}

      {gameState === 'result' && cocktail && (
          <div className="absolute inset-0 z-[210] flex flex-col items-center justify-center animate-fade-in px-6">
              <div className="max-w-6xl w-full flex flex-col lg:flex-row gap-16 items-center p-12 lg:p-16 bg-white/80 backdrop-blur-3xl rounded-[48px] shadow-2xl border border-white/50">
                  <div className="w-full lg:flex-1">
                      <div className="relative overflow-hidden rounded-[32px] shadow-2xl aspect-[4/5] bg-white flex items-center justify-center">
                          <WatercolorCocktail colors={cocktail.colors} />
                      </div>
                  </div>
                  <div className="w-full lg:flex-1 space-y-10 text-left">
                      <div className="space-y-4">
                          <span className="text-[10px] text-indigo-500 uppercase tracking-[0.6em] font-bold">Alchemy Result • 手绘心灵处方</span>
                          <h2 className="text-6xl text-slate-900 font-light tracking-tight leading-tight">{cocktail.name}</h2>
                          <h3 className="text-xl text-slate-400 tracking-[0.4em] font-light uppercase">{cocktail.nameEn}</h3>
                      </div>
                      <p className="text-slate-500 leading-relaxed text-lg font-light italic border-l-2 border-slate-100 pl-8">"{cocktail.description}"</p>
                      
                      <div className="pt-10 border-t border-slate-100 space-y-6">
                          <div className="flex gap-8">
                            {cocktail.colors.map((color, i) => (
                                <div key={i} className="flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 rounded-full border-4 border-white shadow-xl" style={{backgroundColor: color}}></div>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold">{['Past', 'Present', 'Future'][i]}</span>
                                </div>
                            ))}
                          </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); resetGame(); }}
                          className="px-12 py-5 bg-slate-900 text-white rounded-full text-[11px] uppercase tracking-[0.5em] hover:bg-black transition-all shadow-xl active:scale-95">
                          重新开启感应
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="absolute bottom-8 left-8 z-[100] flex flex-col gap-3">
          <button onClick={(e) => { e.stopPropagation(); setControlMode(prev => prev === 'hand' ? 'mouse' : 'hand'); }}
                  className="px-4 py-2 bg-white/50 backdrop-blur shadow-lg rounded-full border border-white text-[9px] uppercase tracking-widest text-slate-600 hover:bg-white transition-all flex items-center gap-2 group">
              {controlMode === 'hand' ? <CameraIcon className="w-3 h-3 group-hover:text-indigo-500" /> : <MousePointer2 className="w-3 h-3 group-hover:text-indigo-500" />}
              {controlMode === 'hand' ? 'Hand Mode' : 'Mouse Mode'}
          </button>
      </div>

      {cards.map((card, index) => {
          const isSelected = selectedIndices.includes(index);
          const selectionOrder = selectedIndices.indexOf(index);
          const style = getCardStyle(index);
          const colorToShow = selectedColors[selectionOrder];
          const hasPouredThis = selectionOrder !== -1 && pouredIndices.includes(selectionOrder);
          return (
              <React.Fragment key={card.id}>
                  <div data-card-id={card.id} className="absolute w-36 h-52 perspective-1000" style={style as any}>
                       <div className={`relative w-full h-full transform-style-3d transition-transform duration-[1500ms] ${revealed && isSelected ? 'rotate-y-180' : ''}`}>
                           <div className="absolute w-full h-full backface-hidden rounded-3xl shadow-2xl border border-white/40" style={{ background: CARD_BACK_GRADIENT }}>
                                <div className="w-full h-full flex items-center justify-center opacity-30"><Sparkles className="text-indigo-200 w-10 h-10" /></div>
                           </div>
                           <div className="absolute w-full h-full backface-hidden rotate-y-180 rounded-3xl overflow-hidden shadow-2xl bg-white border-[6px] border-white">
                               <img src={card.image} alt="Front" className="w-full h-full object-cover rounded-2xl" crossOrigin="anonymous" />
                           </div>
                       </div>
                       {revealed && isSelected && (gameState === 'revealing' || gameState === 'color_selection') && (
                           <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 whitespace-nowrap animate-fade-in">
                               <span className="text-[10px] text-slate-400 uppercase tracking-[0.5em] font-bold border-t border-slate-100 pt-5">{['Past', 'Present', 'Future'][selectionOrder]}</span>
                           </div>
                       )}
                       {gameState === 'color_selection' && isSelected && card.palette.length > 0 && (
                           <div className="absolute -top-40 left-1/2 -translate-x-1/2 flex gap-4 animate-fade-in z-[3000]">
                               {card.palette.map((color, cIdx) => (
                                   <div key={cIdx} data-bubble-color={color} data-card-order={selectionOrder}
                                        className={`w-14 h-14 rounded-full border-4 cursor-pointer transition-all duration-500 hover:scale-125 hover:shadow-2xl flex items-center justify-center ${selectedColors[selectionOrder] === color ? 'border-indigo-500 scale-110 shadow-xl' : 'border-white shadow-lg'}`}
                                        style={{backgroundColor: color}}>
                                        {selectedColors[selectionOrder] === color && <CheckCircle2 className="w-6 h-6 text-white drop-shadow-md" />}
                                   </div>
                               ))}
                           </div>
                       )}
                       {gameState === 'filling_glass' && isSelected && colorToShow && (
                           <div data-pour-source-idx={selectionOrder}
                                className={`absolute -right-36 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-4 border-white shadow-2xl transition-all duration-700 cursor-pointer ${hasPouredThis ? 'opacity-20 scale-75' : 'opacity-100 hover:scale-110'}`}
                                style={{backgroundColor: colorToShow}}>
                               {!hasPouredThis && currentlyPouringIdx === selectionOrder && (
                                   <svg className="absolute inset-0 w-full h-full rotate-[-90deg]">
                                       <circle cx="50%" cy="50%" r="44" stroke="white" strokeWidth="6" fill="none" strokeDasharray={276} strokeDashoffset={276 - (276 * hoverProgress)} />
                                   </svg>
                               )}
                               {!hasPouredThis ? <Droplets className="w-full h-full p-6 text-white" /> : <CheckCircle2 className="w-full h-full p-6 text-white" />}
                           </div>
                       )}
                  </div>
              </React.Fragment>
          );
      })}

      {gameState === 'filling_glass' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-[80] animate-fade-in">
              <div className="relative w-56 h-80 border-x-[1px] border-b-[1px] border-slate-200 rounded-b-[48px] bg-white/10 backdrop-blur-md shadow-2xl overflow-hidden">
                  {[0, 1, 2].map(i => (
                      <div key={i} className={`absolute bottom-0 w-full transition-all duration-1000 ease-out`}
                           style={{ height: pouredColors.length > i ? `${(i + 1) * 33.3}%` : '0%', backgroundColor: pouredColors[i] || 'transparent', opacity: 0.7, zIndex: 10 - i, filter: 'blur(10px)' }}>
                      </div>
                  ))}
                  {isPouring && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-[20]"
                           style={{ backgroundColor: currentlyPouringIdx !== null ? selectedColors[currentlyPouringIdx] : 'transparent', opacity: 0.4 }}>
                      </div>
                  )}
              </div>
              <p className="mt-8 text-slate-300 text-[9px] tracking-[0.8em] uppercase font-bold">Alchemy Crucible</p>
          </div>
      )}

      <div className={`fixed w-10 h-10 border-[1px] border-slate-200/50 rounded-full z-[10000] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center`} 
           style={{ left: smoothCursor.x, top: smoothCursor.y }}>
          <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${gesture === 'pinch' || isPouring ? 'bg-indigo-400 scale-[4]' : 'bg-slate-300 scale-100'} shadow-lg`}></div>
          {gameState === 'selecting' && hoveredCardId !== null && (
              <svg className="absolute w-12 h-12 rotate-[-90deg]">
                  <circle cx="24" cy="24" r="22" stroke="rgba(99, 102, 241, 0.4)" strokeWidth="1" fill="none" strokeDasharray={138} strokeDashoffset={138 - (138 * hoverProgress)} />
              </svg>
          )}
      </div>

      {gameState === 'brewing' && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-[#fdfdfb] animate-fade-in">
              <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                  <div className="absolute inset-0 border-[1px] border-slate-200 rounded-full animate-spin"></div>
                  <Sparkles className="text-indigo-300 w-12 h-12 animate-pulse" />
              </div>
              <h2 className="text-2xl text-slate-800 tracking-[1em] font-light animate-pulse uppercase">Brewing Insight</h2>
          </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 1.2s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
      `}</style>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
