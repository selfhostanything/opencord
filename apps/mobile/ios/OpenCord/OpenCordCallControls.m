#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(OpenCordCallControls, RCTEventEmitter)

RCT_EXTERN_METHOD(setup:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hasPhoneAccount:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setAvailable:(BOOL)active)

RCT_EXTERN_METHOD(startCall:(NSString *)uuid
                  handle:(NSString *)handle
                  displayName:(NSString *)displayName
                  handleType:(NSString *)handleType
                  hasVideo:(BOOL)hasVideo
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reportConnectedOutgoingCallWithUUID:(NSString *)uuid)

RCT_EXTERN_METHOD(setCurrentCallActive:(NSString *)uuid)

RCT_EXTERN_METHOD(setMutedCall:(NSString *)uuid
                  muted:(BOOL)muted)

RCT_EXTERN_METHOD(endCall:(NSString *)uuid)

@end
