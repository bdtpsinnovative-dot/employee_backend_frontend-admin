package service

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type StorageService struct {
	client     *s3.Client
	bucketName string
}

func NewStorageService() (*StorageService, error) {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	bucketName := os.Getenv("R2_BUCKET_NAME")

	if accountID == "" || accessKey == "" || secretKey == "" || bucketName == "" {
		return nil, fmt.Errorf("R2 credentials not fully set in environment")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"),
		config.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(
			fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID),
		)
	})

	return &StorageService{
		client:     client,
		bucketName: bucketName,
	}, nil
}

// UploadFile uploads a file to R2 and returns its private object key.
func (s *StorageService) UploadFile(ctx context.Context, file io.Reader, fileName, contentType string) (string, error) {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucketName),
		Key:         aws.String(fileName),
		Body:        file,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}

	return fileName, nil
}
