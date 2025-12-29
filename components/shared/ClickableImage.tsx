'use client';

import { useState } from 'react';
import Image from 'next/image';
import ImageModal from './ImageModal';

interface ClickableImageProps {
  src: string;
  alt: string;
  className?: string;
  labelClassName?: string;
  label: string;
}

/**
 * Clickable image thumbnail that opens in a fullscreen modal
 */
export default function ClickableImage({ 
  src, 
  alt, 
  className,
  labelClassName,
  label 
}: ClickableImageProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div 
        className={className}
        onClick={() => setIsOpen(true)}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsOpen(true)}
      >
        <Image 
          src={src} 
          alt={alt}
          width={400}
          height={200}
          style={{ objectFit: 'cover', width: '100%', height: '200px' }}
        />
        <div className={labelClassName}>{label}</div>
      </div>
      
      {isOpen && (
        <ImageModal 
          src={src} 
          alt={alt} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  );
}
