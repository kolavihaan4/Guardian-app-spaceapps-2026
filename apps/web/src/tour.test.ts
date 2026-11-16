/// <reference types="vite/client" />
import source from '../public/home/js/tour.js?raw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const win=window as typeof window & {GuardianTour:{start():Promise<void>}}
beforeEach(()=>{
 vi.useFakeTimers();localStorage.clear();sessionStorage.clear();history.replaceState(null,'','/home/index.html#/dashboard');document.documentElement.className=''
 document.body.innerHTML='<nav id="nav"><a data-nav="dashboard">Dashboard</a></nav><div id="main"><button data-action="use-template" data-id="crew-health">Log vitals</button></div><div id="modalRoot"></div><button data-action="guide">Help</button>'
 window.GuardianAuth={user:()=>Promise.resolve({id:'test',email:'test@example.com'})} as typeof window.GuardianAuth
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({left:10,top:10,width:100,height:100,right:110,bottom:110,x:10,y:10,toJSON(){}})
 Element.prototype.scrollIntoView=vi.fn()
})
afterEach(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();document.body.innerHTML=''})
describe('guided walkthrough',()=>{
 it('opens from Help and shows the actual card form even while the page is inert',async()=>{
  document.querySelector('[data-action="use-template"]')!.addEventListener('click',()=>{
   (document.querySelector('#main') as HTMLElement).inert=true
   document.querySelector('#modalRoot')!.innerHTML='<form id="cardForm"><input value="Health card"><input value=""></form><button type="submit" form="cardForm">Done</button><button data-close>Cancel</button>'
  })
  new Function(source)()
  await win.GuardianTour.start();await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelector('.guardian-tour h2')?.textContent).toBe('Welcome to Guardian')
  ;(document.querySelector('[data-tour="next"]') as HTMLElement).click();await vi.advanceTimersByTimeAsync(150)
  ;(document.querySelector('[data-tour="next"]') as HTMLElement).click();await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelector('.guardian-tour h2')?.textContent).toBe('Name your card and add readings')
  ;(document.querySelector('[data-tour="next"]') as HTMLElement).click();await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelector('.guardian-tour h2')?.textContent).toBe('Keep it in your account')
  const input=document.querySelectorAll('input')[1]!;input.value='72'
  ;(document.querySelector('[data-tour="next"]') as HTMLElement).click()
  expect(document.querySelector('.guardian-tour p')?.textContent).toContain('Your entries stay here')
  expect(input.value).toBe('72')
 })
 it('starts for a new account and can be dismissed without saving a card',async()=>{
  localStorage.setItem('guardian.tour.pending.test','1')
  new Function(source)()
  document.dispatchEvent(new Event('DOMContentLoaded'));await vi.advanceTimersByTimeAsync(200)
  expect(document.querySelector('.guardian-tour')).not.toBeNull()
  ;(document.querySelector('[data-tour="skip"]') as HTMLElement).click()
  expect(document.querySelector('.guardian-tour')).toBeNull()
  expect(localStorage.getItem('guardian.tour.done.test')).toBe('1')
  expect(localStorage.getItem('guardian.tour.pending.test')).toBeNull()
 })
})
