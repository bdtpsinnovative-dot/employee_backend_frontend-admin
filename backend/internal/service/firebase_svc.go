package service

import (
	"context"
	"fmt"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

type FirebaseService struct {
	app    *firebase.App
	client *messaging.Client
}

func NewFirebaseService() *FirebaseService {
	// Check if firebase-service-account.json exists in root
	credPath := os.Getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
	if credPath == "" {
		credPath = "firebase-service-account.json"
	}

	if _, err := os.Stat(credPath); os.IsNotExist(err) {
		log.Printf("[Firebase] Warning: %s not found. Push notifications will run in mock/dry-run mode.", credPath)
		return &FirebaseService{}
	}

	opt := option.WithCredentialsFile(credPath)
	app, err := firebase.NewApp(context.Background(), nil, opt)
	if err != nil {
		log.Printf("[Firebase] Error initializing Firebase app: %v. Running in mock mode.", err)
		return &FirebaseService{}
	}

	client, err := app.Messaging(context.Background())
	if err != nil {
		log.Printf("[Firebase] Error initializing FCM client: %v. Running in mock mode.", err)
		return &FirebaseService{}
	}

	log.Printf("[Firebase] Initialized successfully with credentials from %s", credPath)
	return &FirebaseService{
		app:    app,
		client: client,
	}
}

func (s *FirebaseService) SendNotification(ctx context.Context, fcmToken string, title, body string) error {
	if fcmToken == "" {
		return nil
	}
	if s.client == nil {
		log.Printf("[Firebase Mock] Sending push notification (Token: %s, Title: %s, Body: %s)", fcmToken, title, body)
		return nil
	}

	message := &messaging.Message{
		Token: fcmToken,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Android: &messaging.AndroidConfig{
			Notification: &messaging.AndroidNotification{
				Sound:     "custom_notification",
				ChannelID: "custom_sound_channel",
			},
		},
		APNS: &messaging.APNSConfig{
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{
					Sound: "custom_notification.caf",
				},
			},
		},
	}

	response, err := s.client.Send(ctx, message)
	if err != nil {
		return fmt.Errorf("failed to send push notification: %w", err)
	}

	log.Printf("[Firebase] Successfully sent push notification: %s", response)
	return nil
}
