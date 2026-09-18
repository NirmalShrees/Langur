import React from 'react';

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
  const isImageUrl =
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
          crossOrigin="anonymous"
          onError={(e) => {
            // Fallback to initial if image fails
            const target = e.currentTarget;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              const fallback = document.createElement('span');
              fallback.innerText = name ? name.charAt(0).toUpperCase() : '🎲';
              fallback.className = 'font-bold text-amber-300';
              parent.appendChild(fallback);
            }
          }}
        />
      ) : (
        <span className="leading-none">{avatar || '🎲'}</span>
      )}
    </div>
  );
};
