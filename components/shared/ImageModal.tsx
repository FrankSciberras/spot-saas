'use client';

import { useEffect, useCallback } from 'react';
import Image from 'next/image';
import styles from './ImageModal.module.css';

interface ImageModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Fullscreen image modal/lightbox component
 */
export default function ImageModal({ src, alt, onClose }: ImageModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <button className={styles.closeButton} onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className={styles.imageContainer} onClick={(e) => e.stopPropagation()}>
        <Image
          src={src}
          alt={alt}
          fill
          style={{ objectFit: 'contain' }}
          sizes="100vw"
          priority
        />
      </div>
      <p className={styles.caption}>{alt}</p>
    </div>
  );
}
