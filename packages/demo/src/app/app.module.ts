import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { AngularFireModule } from '@angular/fire';
import {
  AngularFirestoreModule,
  SETTINGS as FIRESTORE_SETTINGS,
} from '@angular/fire/firestore';
import {
  AngularFireFunctionsModule,
  ORIGIN as FUNCTIONS_ORIGIN,
} from '@angular/fire/functions';
import { GoogleMapsModule } from '@angular/google-maps';

import { AppComponent } from './app.component';
import { environment } from 'src/environments/environment';
import { RealtimeMapComponent } from './realtime-map/realtime-map.component';
import { CommonModule } from '@angular/common';

@NgModule({
  declarations: [AppComponent, RealtimeMapComponent],
  imports: [
    BrowserModule,
    CommonModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule,
    AngularFireFunctionsModule,
    GoogleMapsModule,
  ],
  bootstrap: [AppComponent],
  providers: [
    {
      provide: FIRESTORE_SETTINGS,
      useValue: environment.emulator
        ? {
            host: 'localhost:8080',
            ssl: false,
          }
        : undefined,
    },
    {
      provide: FUNCTIONS_ORIGIN,
      useValue: environment.emulator ? 'http://localhost:5001' : undefined,
    },
  ],
})
export class AppModule {}
