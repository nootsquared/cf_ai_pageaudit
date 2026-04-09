"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export const Tooltip = ({
  content,
  children,
  containerClassName,
}: {
  content: string | React.ReactNode;
  children: React.ReactNode;
  containerClassName?: string;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [height, setHeight] = useState(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [isVisible, content]);

  const calculatePosition = (clientX: number, clientY: number) => {
    const tooltipWidth = 240; // min-w-[15rem] = 240px
    const tooltipHeight = contentRef.current ? contentRef.current.scrollHeight : 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let finalX = clientX + 12;
    let finalY = clientY + 12;

    // Check if tooltip goes beyond right edge
    if (finalX + tooltipWidth > viewportWidth) {
      finalX = clientX - tooltipWidth - 12;
    }

    // Check if tooltip goes beyond left edge
    if (finalX < 0) {
      finalX = 12;
    }

    // Check if tooltip goes beyond bottom edge
    if (finalY + tooltipHeight > viewportHeight) {
      finalY = clientY - tooltipHeight - 12;
    }

    // Check if tooltip goes beyond top edge
    if (finalY < 0) {
      finalY = 12;
    }

    return { x: finalX, y: finalY };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsVisible(true);
    setPosition(calculatePosition(e.clientX, e.clientY));
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isVisible) return;
    setPosition(calculatePosition(e.clientX, e.clientY));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    setPosition(calculatePosition(touch.clientX, touch.clientY));
    setIsVisible(true);
  };

  const handleTouchEnd = () => {
    setTimeout(() => {
      setIsVisible(false);
      setPosition({ x: 0, y: 0 });
    }, 2000);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.matchMedia("(hover: none)").matches) {
      e.preventDefault();
      if (isVisible) {
        setIsVisible(false);
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition(calculatePosition(e.clientX, e.clientY));
        setIsVisible(true);
      }
    }
  };

  // Update position when tooltip dimensions change
  useEffect(() => {
    if (isVisible && contentRef.current && position.x !== 0) {
      setPosition((prev) => calculatePosition(
        prev.x > 0 ? prev.x - 12 : prev.x + 240 + 12,
        prev.y > 0 ? prev.y - 12 : prev.y + (contentRef.current?.scrollHeight ?? 0) + 12,
      ));
    }
  }, [height]);

  const tooltipEl = isVisible ? (
    <AnimatePresence>
      <motion.div
        key="tooltip"
        initial={{ height: 0, opacity: 1 }}
        animate={{ height, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 20,
        }}
        className="pointer-events-none fixed z-[9999] min-w-[15rem] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm ring-1 shadow-black/5 ring-black/5 dark:bg-neutral-900 dark:border-neutral-700 dark:shadow-white/10 dark:ring-white/5"
        style={{
          top: position.y,
          left: position.x,
        }}
      >
        <div
          ref={contentRef}
          className="p-2 text-sm text-neutral-600 md:p-4 dark:text-neutral-400"
        >
          {content}
        </div>
      </motion.div>
    </AnimatePresence>
  ) : (
    // Keep contentRef mounted invisibly to measure height
    <div ref={contentRef} style={{ display: "none" }}>
      {content}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", containerClassName)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {children}
      {typeof document !== "undefined" && createPortal(tooltipEl, document.body)}
    </div>
  );
};
