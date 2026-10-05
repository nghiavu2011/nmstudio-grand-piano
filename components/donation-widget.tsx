'use client';

import React, { useState } from 'react';
import { Copy, Check, Coffee, X, QrCode } from 'lucide-react';

interface DonationProps {
  locale: 'vi' | 'en';
}

export function DonationWidget({ locale }: DonationProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isVi = locale === 'vi';

  return (
    <>
      {/* Refined Bottom-Right Floating Container */}
      <div className="fixed right-6 bottom-12 z-40 flex flex-col items-end">
        {/* Quick Popover Card (Expands upwards from bottom-right) */}
        {cardOpen && (
          <aside
            id="donation-bottom-right-card"
            className="mb-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl border border-amber-500/30 bg-neutral-950/95 p-3.5 shadow-2xl backdrop-blur-2xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-3"
            style={{ fontFamily: 'inherit', color: '#f5f5f5' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 font-bold text-amber-400 text-xs tracking-wider">
                <Coffee size={15} />
                <span>{isVi ? 'ỦNG HỘ TÁC GIẢ' : 'BUY ME A COFFEE'}</span>
              </div>
              <button
                type="button"
                onClick={() => setCardOpen(false)}
                className="flex h-5 w-5 items-center justify-center rounded-md bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
                title={isVi ? 'Đóng' : 'Close'}
              >
                <X size={13} />
              </button>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-neutral-300">
              {isVi
                ? 'Tiếp sức duy trì máy chủ & lan tỏa trải nghiệm Piano 3D miễn phí:'
                : 'Support hosting & interactive 3D piano experience development:'}
            </p>

            {/* Quick Bank Box (Techcombank) */}
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <div className="flex items-center gap-1 font-bold text-rose-400">
                  <span className="rounded bg-rose-600 px-1 py-0.2 text-[9px] text-white font-semibold">TCB</span>
                  <span>Techcombank</span>
                </div>
                <span className="text-[9px] text-neutral-400">Napas 247</span>
              </div>
              <div className="flex justify-center bg-white p-1 rounded-lg my-1">
                <img src="/assets/Techcom.jpg" alt="QR Techcombank" className="h-28 w-28 object-contain" />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono font-bold text-amber-400">19077215974018</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('19077215974018', 'tcb')}
                  className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
                >
                  {copiedKey === 'tcb' ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedKey === 'tcb' ? (isVi ? 'Đã chép' : 'Copied') : (isVi ? 'Chép STK' : 'Copy')}</span>
                </button>
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5 text-center">
                {isVi ? 'Vũ Trọng Nghĩa' : 'Vu Trong Nghia'}
              </div>
            </div>

            {/* View Full Modal Button (Includes MoMo) */}
            <button
              type="button"
              onClick={() => {
                setCardOpen(false);
                setModalOpen(true);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <QrCode size={13} />
              <span>{isVi ? 'Mã QR MoMo & Thông tin chi tiết' : 'View MoMo & Full Details'}</span>
            </button>
          </aside>
        )}

        {/* Floating Trigger Pill */}
        <button
          type="button"
          onClick={() => setCardOpen(!cardOpen)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-2xl backdrop-blur-md transition-all duration-200 ${
            cardOpen
              ? 'border-amber-400 bg-amber-500/20 text-amber-300 ring-2 ring-amber-400/30'
              : 'border-amber-500/40 bg-neutral-950/85 text-amber-400 hover:bg-amber-500/15 hover:border-amber-400 hover:scale-105'
          }`}
          title={isVi ? 'Ủng hộ tác giả Vũ Trọng Nghĩa' : 'Buy me a coffee - Support the creator'}
          aria-expanded={cardOpen}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Coffee size={11} />
          </span>
          <span className="tracking-wide">{isVi ? 'Ủng hộ tác giả' : 'Buy me a coffee'}</span>
        </button>
      </div>

      {/* Detailed Modal Overlay */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-amber-500/40 bg-neutral-950 p-6 shadow-2xl text-neutral-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-neutral-300 hover:bg-white/20 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 mb-2">
                <Coffee size={28} />
              </div>
              <h3 className="text-xl font-bold text-amber-400">
                {isVi ? 'Mời Tách Cà Phê — Tiếp Sức Tác Giả' : 'Buy Me a Coffee — Support the Creator'}
              </h3>
              <p className="mt-1 text-xs text-neutral-300 max-w-sm mx-auto">
                {isVi
                  ? 'Mọi đóng góp từ bạn là nguồn năng lượng quý báu giúp tác giả duy trì máy chủ & tiếp tục sáng tạo các sản phẩm âm nhạc số miễn phí cho cộng đồng.'
                  : 'Your generous support helps keep the server running and fuels the development of open-source interactive music web experiences.'}
              </p>
            </div>

            {/* 2 QR Columns */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              {/* Techcombank */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 font-bold text-rose-400 text-xs mb-1.5">
                  <span className="rounded bg-rose-600 px-1 py-0.5 text-[10px] text-white font-semibold">TCB</span>
                  <span>Techcombank</span>
                </div>
                <div className="bg-white p-1 rounded-xl mb-2 flex justify-center">
                  <img src="/assets/Techcom.jpg" alt="QR Techcombank" className="h-36 w-36 object-contain" />
                </div>
                <div className="text-[11px] text-neutral-400">
                  {isVi ? 'Chủ TK:' : 'Name:'} <strong className="text-white">Vũ Trọng Nghĩa</strong>
                </div>
                <div className="text-sm font-mono font-bold text-amber-400 my-1">19077215974018</div>
                <button
                  type="button"
                  onClick={() => copyToClipboard('19077215974018', 'modal_tcb')}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30"
                >
                  {copiedKey === 'modal_tcb' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'modal_tcb' ? (isVi ? 'Đã sao chép' : 'Copied') : (isVi ? 'Sao Chép STK' : 'Copy Number')}</span>
                </button>
              </div>

              {/* MoMo */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 font-bold text-pink-400 text-xs mb-1.5">
                  <span className="rounded bg-pink-600 px-1 py-0.5 text-[10px] text-white font-semibold">MoMo</span>
                  <span>Ví MoMo</span>
                </div>
                <div className="bg-white p-1 rounded-xl mb-2 flex justify-center">
                  <img src="/assets/MOMO.jpg" alt="QR MoMo" className="h-36 w-36 object-contain" />
                </div>
                <div className="text-[11px] text-neutral-400">
                  {isVi ? 'Chủ Ví:' : 'Name:'} <strong className="text-white">Vũ Trọng Nghĩa</strong>
                </div>
                <div className="text-sm font-mono font-bold text-amber-400 my-1">0985 578 385</div>
                <button
                  type="button"
                  onClick={() => copyToClipboard('0985578385', 'modal_momo')}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-pink-500/20 py-1.5 text-xs font-semibold text-pink-300 hover:bg-pink-500/30"
                >
                  {copiedKey === 'modal_momo' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'modal_momo' ? (isVi ? 'Đã sao chép' : 'Copied') : (isVi ? 'Sao Chép SĐT' : 'Copy MoMo')}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-center text-xs text-amber-200">
              {isVi ? '💖 Lời nhắn chuyển khoản (tùy tâm): "Ung ho N&Mstudio Piano" hoặc lời chúc của bạn.' : '💖 Transfer memo: "Support NMstudio Piano" or your kind words.'}
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-4 w-full rounded-xl bg-white/10 py-2 text-xs font-bold text-neutral-300 hover:bg-white/20 hover:text-white"
            >
              {isVi ? 'Đóng cửa sổ' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
