import React, { useState, useEffect } from 'react';

interface UserAvatarProps {
  avatar?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
  imgClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar = '🎲',
  name = 'Player',
  size = 'md',
  className = '',
  imgClassName = '',
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state when avatar prop changes so user can switch back and forth freely
  useEffect(() => {
    setHasError(false);
  }, [avatar]);

  const isImageUrl =
    !hasError &&
    typeof avatar === 'string' &&
    (avatar.startsWith('http://') ||
      avatar.startsWith('https://') ||
      avatar.startsWith('data:image/'));

  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-2xl',
    xl: 'w-20 h-20 text-4xl',
    custom: '',
  };

  const initialLetter = (name || 'P').trim().charAt(0).toUpperCase() || '🎲';

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none ${
        sizeClasses[size]
      } ${className}`}
    >
      {isImageUrl ? (
        <img
          src={avatar}
          alt={name}
          className={`w-full h-full object-cover ${imgClassName}`}
          referrerPolicy="no-referrer"
          loading="eager"
          onError={() => {
            setHasError(true);
          }}
        />
      ) : hasError ? (
        <div className="w-full h-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center font-bold text-slate-950 font-serif leading-none">
          {initialLetter}
        </div>
      ) : (
        <span className="leading-none">{avatar || '🎲'}</span>
      )}
    </div>
  );
};
