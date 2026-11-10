// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRentalDraft, CONDITION_AREAS, DEFAULT_RENTAL_RATES } from "@shared/rentalHandoff";
const mocks=vi.hoisted(()=>({saveReturn:vi.fn(),confirmSettlement:vi.fn(),close:vi.fn(),returnComplete:vi.fn()}));
vi.mock("@/lib/trpc",()=>({trpc:{rentalHandoff:new Proxy({}, {get:(_,key:string)=>({useMutation:()=>({isPending:false,mutateAsync:(mocks as any)[key]||vi.fn().mockResolvedValue({})})})})}}));
import { ReturnFlow } from "./ReturnFlow";
let root:Root,container:HTMLDivElement;
const returned=()=>({returnedAt:"2026-11-10T21:00:00Z",odometer:10010,fuel:"Full" as const,condition:CONDITION_AREAS.map(area=>({area,ok:true,note:""})),noticeAt:"",tolls:0,parking:0,fines:0,researchEvents:0,cleaning:0,roadside:0,lossOfUseDays:0,lossOfUseResponsible:false,damageNoticeNotes:"",notes:"",chargesSettled:false,representativeName:"Test staff"});
const record=(status="Out")=>({id:77,revision:2,status,activePacketId:88,draft:{...emptyRentalDraft(),renterName:"Sample renter",pickupAt:"2026-11-09T21:00:00Z",odometerOut:10000,election:"B"},rates:DEFAULT_RENTAL_RATES,returnData:returned(),assets:["returnFront","returnRear","returnDriver","returnPassenger","returnRenterSignature","returnRepresentativeSignature"].map((kind,i)=>({id:100+i,kind,url:"/test-image"})),packets:[],emails:[],audit:[]});
const session=(role="claims")=>({actor:{key:"test",name:"Test",role,locationIds:[1]},locations:[{id:1,timezone:"America/New_York"}],vehicles:[],settings:{},launchGaps:[]});
const button=(text:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent?.includes(text))!;
async function mount(status="Out",role="claims",onBack=vi.fn(),refresh=vi.fn().mockResolvedValue({})){await act(async()=>{root.render(React.createElement(ReturnFlow,{record:record(status) as any,session:session(role) as any,upload:vi.fn(),refresh,onBack}));});return {onBack,refresh};}
async function click(el:HTMLElement){await act(async()=>{el.click();});}
async function input(label:string,value:string){const el=Array.from(container.querySelectorAll("label")).find(l=>l.querySelector("span")?.textContent===label)?.querySelector("input")!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
beforeEach(()=>{vi.stubGlobal("React",React);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);for(const m of Object.values(mocks))m.mockReset();mocks.saveReturn.mockResolvedValue({revision:3});mocks.confirmSettlement.mockResolvedValue({revision:3});mocks.close.mockResolvedValue({});container=document.createElement("div");document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Return workflow completion",()=>{
 it("autosaves return edits with the current revision and disables completion until signatures are recaptured",async()=>{vi.useFakeTimers();await mount();await input("Return odometer (miles)","10020");expect(container.textContent).toContain("Unsaved changes");expect(button("Complete return & email copy").disabled).toBe(true);await act(async()=>{await vi.advanceTimersByTimeAsync(650);});expect(mocks.saveReturn).toHaveBeenCalledWith(expect.objectContaining({id:77,revision:2,data:expect.objectContaining({odometer:10020})}));expect(container.textContent).toContain("All changes saved");});
 it("flushes a pending return edit before navigating away",async()=>{vi.useFakeTimers();const {onBack}=await mount();await input("Return odometer (miles)","10030");await click(button("Back to rental"));expect(mocks.saveReturn).toHaveBeenCalledTimes(1);expect(onBack).toHaveBeenCalledTimes(1);});
 it("requires a separate explicit settlement confirmation before closing an unpaid returned record",async()=>{await mount("Returned");expect(button("Confirm charges posted and settled").disabled).toBe(true);expect(button("Mark charges posted & close").disabled).toBe(true);const label=Array.from(container.querySelectorAll("label")).find(l=>l.textContent?.includes("I confirm charges were posted"))!;await click(label.querySelector("input")!);await click(button("Confirm charges posted and settled"));expect(mocks.confirmSettlement).toHaveBeenCalledWith({id:77,revision:2,confirmed:true});expect(mocks.close).not.toHaveBeenCalled();expect(container.textContent).toContain("signed return PDF remains unchanged");});
 it("does not expose settlement or close controls to shop staff",async()=>{await mount("Returned","shop");expect(button("Confirm charges posted and settled")).toBeUndefined();expect(button("Mark charges posted & close")).toBeUndefined();expect(mocks.saveReturn).not.toHaveBeenCalled();});
});
