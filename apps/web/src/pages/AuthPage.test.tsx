import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_ADDRESS, goToDashboard } from '../guardian'
import { auth } from '../lib/auth'
import { AuthPage } from './AuthPage'

// the page borrows the logo from App, which would pull every other page into this test
vi.mock('../App', () => ({ Brand: () => null }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the sign-in page', () => {
  it('says what happens to what you enter, and to your email', () => {
    render(<AuthPage onSignedIn={() => {}} />)
    expect(screen.getByText('Anything you enter in Guardian is saved to your account.')).toBeInTheDocument()
    expect(screen.getByText('Your email is only used to sign you in and keep your data with your account. It is not used for anything else.')).toBeInTheDocument()
  })

  it('a successful sign-in goes to the dashboard address', async () => {
    const signIn = vi.spyOn(auth, 'signIn').mockResolvedValue({ id: 'u1', email: 'crew@example.org' })
    const go = vi.fn()
    const { container } = render(<AuthPage onSignedIn={() => goToDashboard(go)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })) // from "Create account" to "Sign in"
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'crew@example.org' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'a long password' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(go).toHaveBeenCalledWith('/home/index.html#/dashboard'))
    expect(DASHBOARD_ADDRESS).toBe('/home/index.html#/dashboard')
    expect(signIn).toHaveBeenCalledWith('crew@example.org', 'a long password')
  })

  it('a successful sign-up goes to the dashboard address too', async () => {
    const signUp = vi.spyOn(auth, 'signUp').mockResolvedValue({ id: 'u2', email: 'new@example.org' })
    const go = vi.fn()
    const { container } = render(<AuthPage onSignedIn={() => goToDashboard(go)} />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'new@example.org' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'eight888' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(go).toHaveBeenCalledWith('/home/index.html#/dashboard'))
    expect(signUp).toHaveBeenCalledWith('new@example.org', 'eight888')
  })

  it('states the 8-character minimum and refuses a shorter password before sending it', async () => {
    const signUp = vi.spyOn(auth, 'signUp')
    const { container } = render(<AuthPage onSignedIn={() => {}} />)
    expect(screen.getByLabelText('Password (at least 8 characters)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'crew@example.org' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'seven77' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.submit(container.querySelector('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a password of at least 8 characters.')
    expect(signUp).not.toHaveBeenCalled()
  })
})
