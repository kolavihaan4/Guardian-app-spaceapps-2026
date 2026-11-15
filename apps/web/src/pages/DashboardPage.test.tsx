import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { auth } from '../lib/auth'
vi.mock('../lib/auth',()=>({auth:{cards:vi.fn()}}))
vi.mock('recharts',()=>{
 const Box=({children}:{children?:unknown})=><div>{children as never}</div>
 return {ResponsiveContainer:Box,LineChart:Box,ScatterChart:Box,CartesianGrid:()=>null,Line:()=>null,Scatter:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}
})
describe('User vitals',()=>{
 it('loads saved account cards and switches the displayed vital',async()=>{
  vi.mocked(auth.cards).mockResolvedValue([{id:'one',title:'Morning',createdAt:100,vitals:{heartRate:{value:72,unit:'Beats Per Minute'},bloodPressure:{value:'120/80',unit:'mm/Hg'}}},{id:'two',title:'Evening',createdAt:200,vitals:{heartRate:{value:76,unit:'Beats Per Minute'}}}])
  render(<DashboardPage/>);await screen.findByRole('heading',{name:'User vitals'})
  await waitFor(()=>expect(screen.getByText('76')).toBeInTheDocument())
  expect(screen.getByRole('img',{name:'Heart rate from 2 saved cards'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Which vital would you like to see?'),{target:{value:'bloodPressure'}})
  expect(screen.getByRole('img',{name:'Blood pressure from 1 saved cards'})).toBeInTheDocument()
  expect(screen.getAllByText(/120\/80/).length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('Which vital would you like to see?'),{target:{value:'sleep'}})
  expect(screen.getByRole('heading',{name:'No sleep readings yet'})).toBeInTheDocument()
 })
 it('shows a retry message when account cards fail to load',async()=>{
  vi.mocked(auth.cards).mockRejectedValue(new Error('offline'))
  render(<DashboardPage/>);expect(await screen.findByRole('alert')).toHaveTextContent('Your cards could not be loaded')
  expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument()
 })
})
